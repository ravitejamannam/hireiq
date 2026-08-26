import { CandidateStatus } from "@prisma/client";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

/**
 * T129 Sourced candidate intake (hireEZ-lite steal).
 *
 * Recruiters add outbound-sourced candidates (LinkedIn / Naukri)
 * directly into a requirement's pipeline — no hosted apply click
 * required. Deduplicates on the Application(candidateId, jobId) unique
 * constraint so re-adding the same person is idempotent.
 */

export type SourcedCandidateInput = {
  jobId: number;
  name: string;
  /** Optional — enables candidate stage-change emails for this person. */
  email?: string;
  skills?: string;
  experienceYears?: number;
  location?: string;
  currentEmployer?: string;
  expectedCTC?: string;
  source: "LINKEDIN" | "NAUKRI";
};

export type SourcedCandidateResult =
  | { ok: true; applicationId: number; candidateId: number; reusedCandidate: boolean }
  | { ok: false; error: string };

export async function addSourcedCandidate(
  input: SourcedCandidateInput,
): Promise<SourcedCandidateResult> {
  let companyId: number;
  try {
    const admin = await requireAdmin();
    if (!admin.companyId) {
      return { ok: false, error: "No workspace found for this admin." };
    }
    companyId = admin.companyId;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: "Admin access required." };
    }
    throw error;
  }
  return addSourcedCandidateForCompany({ companyId, ...input });
}

/**
 * Core intake used by both the admin UI path (session auth above) and
 * the public API path (API-key auth in the route). Single source of
 * truth for candidate matching, application upsert, and MANUAL
 * provenance events.
 */
export async function addSourcedCandidateForCompany(input: {
  companyId: number;
} & SourcedCandidateInput): Promise<SourcedCandidateResult> {
  const adminCompanyId = input.companyId;

  const name = input.name?.trim();
  if (!name || name.length < 2 || name.length > 120) {
    return { ok: false, error: "Candidate name is required." };
  }

  const job = await prisma.job.findFirst({
    where: { id: input.jobId, companyId: adminCompanyId },
    select: { id: true, companyId: true, title: true },
  });
  if (!job) {
    return { ok: false, error: "Requirement not found in your workspace." };
  }

  const experienceYears =
    Number.isFinite(input.experienceYears) && (input.experienceYears ?? 0) >= 0
      ? Math.floor(input.experienceYears as number)
      : 0;

  // Audit fix: optional email is normalised and recorded via a MANUAL
  // ingestion event so stage-change notifications reach these candidates.
  const emailNormalized = input.email?.trim().toLowerCase() || null;
  if (emailNormalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) {
    return { ok: false, error: "Email address is invalid." };
  }

  // Prefer the published specification version for provenance; fall back
  // to the latest version so MANUAL events always satisfy the FK.
  const specVersion = await prisma.jobSpecificationVersion.findFirst({
    where: { jobId: job.id },
    orderBy: [{ status: "desc" }, { versionNumber: "desc" }],
    select: { id: true },
  });
  if (!specVersion) {
    return { ok: false, error: "Requirement has no specification version." };
  }
  const publishedVersionId = specVersion.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Match an existing candidate by exact name within this company.
      // (Candidate identity has no email by constitution — §Identity.)
      const existing = await tx.candidate.findFirst({
        where: { companyId: job.companyId, name },
        select: { id: true },
      });

      const candidate =
        existing ??
        (await tx.candidate.create({
          data: {
            name,
            role: job.title,
            experienceYears,
            location: input.location?.trim() || null,
            currentEmployer: input.currentEmployer?.trim() || null,
            skills: input.skills?.trim() || null,
            expectedCTC: input.expectedCTC?.trim() || null,
            status: CandidateStatus.APPLIED,
            companyId: job.companyId,
          },
          select: { id: true },
        }));

      const application = await tx.application.upsert({
        where: {
          candidateId_jobId: { candidateId: candidate.id, jobId: job.id },
        },
        create: {
          candidateId: candidate.id,
          jobId: job.id,
          companyId: job.companyId,
          status: "CV_POOL",
          source: input.source,
        },
        update: {
          source: input.source,
        },
        select: { id: true },
      });

      // Audit fix: record a MANUAL ingestion event so sourced candidates
      // participate in the same provenance chain (and receive stage
      // emails) as hosted-apply candidates.
      await tx.applicationIngestionEvent.create({
        data: {
          companyId: job.companyId,
          jobId: job.id,
          applicationId: application.id,
          candidateId: candidate.id,
          sourceChannel: "MANUAL",
          jobSpecificationVersionId: publishedVersionId,
          status: "PROCESSED",
          applicantName: name,
          applicantEmailNormalized: emailNormalized,
        },
      });

      return {
        applicationId: application.id,
        candidateId: candidate.id,
        reusedCandidate: Boolean(existing),
      };
    });

    return { ok: true, ...result };
  } catch (error) {
    console.error("[sourced-candidate] failed", error);
    return { ok: false, error: "Could not add candidate. Try again." };
  }
}
