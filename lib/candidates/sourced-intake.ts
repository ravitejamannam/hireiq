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
  let adminCompanyId: number;
  try {
    const admin = await requireAdmin();
    if (!admin.companyId) {
      return { ok: false, error: "No workspace found for this admin." };
    }
    adminCompanyId = admin.companyId;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: "Admin access required." };
    }
    throw error;
  }

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
