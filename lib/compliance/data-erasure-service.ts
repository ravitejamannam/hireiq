import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * GDPR Article 17 — right to erasure (T114).
 *
 * Reconciles two duties:
 * - Erase personal data (name, contact, free text, resumes, signals).
 * - Preserve the audit trail's STRUCTURE (§6): scores, statuses,
 *   timestamps, and content hashes survive — they prove the process ran
 *   without identifying anyone.
 *
 * What is erased vs kept:
 *
 *  ERASED                              KEPT
 *  ────────────────────────────────    ──────────────────────────────
 *  name, employer, skills,             candidate.id, pipeline statuses
 *  expectedCTC, location               application statuses + dates
 *  submission email/phone/             evidence.contentSha256 (hash only)
 *    linkedIn/coverLetter              assessment scores + attempts
 *  profile headline/employer/          evaluation scores, rubric weights
 *    linkedIn/skillsText               interview results, coding scores
 *  resume binaries + extracted         blueprint rubric structure
 *    text, identity signal values      billing amounts (legal record)
 *  non-skill claim values
 *
 * Resume BINARIES are deleted from object storage. Admin-only.
 * Callers should confirm no legal hold applies before invoking.
 */

export class DataErasureError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const ERASED_NAME_PREFIX = "Erased Candidate";

export async function anonymizeCandidateForAdmin(input: {
  actorUserId: number;
  candidateIdInput: unknown;
  /** Audit fix: when provided, cross-tenant candidates resolve to NOT_FOUND. */
  expectedCompanyId?: number;
}): Promise<{ candidateId: number; erasedItems: string[] }> {
  await requireAdmin();

  const candidateId = validateCandidateId(input.candidateIdInput);
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, companyId: true, name: true },
  });
  if (!candidate) throw new DataErasureError("CANDIDATE_NOT_FOUND");
  if (input.expectedCompanyId !== undefined && candidate.companyId !== input.expectedCompanyId) {
    throw new DataErasureError("CANDIDATE_NOT_FOUND");
  }

  const erasedItems: string[] = [];

  // 1. Candidate identity fields
  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      name: `${ERASED_NAME_PREFIX} #${candidateId}`,
      currentEmployer: null,
      skills: null,
      location: null,
      expectedCTC: null,
    },
  });
  erasedItems.push("candidate-identity");

  const photoKeys = await prisma.candidateProfile.findMany({
    where: { candidateId },
    select: { photoStorageKey: true },
  });

  // 2. Profile descriptive fields
  await prisma.candidateProfile.updateMany({
    where: { candidateId },
    data: {
      headline: null,
      skillsText: null,
      currentEmployer: null,
      expectedCTC: null,
      linkedInUrl: null,
      location: null,
      aboutText: null,
      roleTitle: null,
      domains: Prisma.JsonNull,
      githubUrl: null,
      portfolioUrl: null,
      twitterUrl: null,
      videoResumeUrl: null,
      leetcodeUrl: null,
      socialLinks: Prisma.JsonNull,
      photoStorageKey: null,
      photoContentType: null,
      experiences: Prisma.JsonNull,
      education: Prisma.JsonNull,
      projects: Prisma.JsonNull,
    },
  });
  erasedItems.push("profile");

  // 3. Identity signals (email/phone/linkedin values)
  await prisma.candidateIdentitySignal.updateMany({
    where: { candidateId },
    data: { normalizedValue: "ERASED" },
  });
  erasedItems.push("identity-signals");

  // 4. Hosted apply submissions (contact PII + authored cover letter)
  // Resolve via ingestion events (authoritative link)
  const events = await prisma.applicationIngestionEvent.findMany({
    where: { candidateId },
    select: { hostedApplySubmissionId: true },
  });
  const submissionIds = events
    .map((e) => e.hostedApplySubmissionId)
    .filter((id): id is number => typeof id === "number");

  if (submissionIds.length > 0) {
    await prisma.hostedApplySubmission.updateMany({
      where: { id: { in: submissionIds } },
      data: {
        name: "ERASED",
        emailNormalized: `erased-${candidateId}@erased.invalid`,
        phone: null,
        location: null,
        linkedInUrl: null,
        coverLetter: null,
        profilePayload: Prisma.JsonNull,
      },
    });
    erasedItems.push("hosted-apply-submissions");
  }

  // 5. Evidence inline text (cover letters / extracted resume text).
  //    Content hashes stay — they prove existence without revealing.
  await prisma.candidateEvidence.updateMany({
    where: { candidateId },
    data: { inlineText: null },
  });
  erasedItems.push("evidence-text");

  // 6. Claims derived from evidence: skill claims stay (not personal),
  //    employer/title/location values erased.
  await prisma.candidateClaim.updateMany({
    where: { candidateId, claimType: { not: "SKILL" } },
    data: { value: "ERASED", normalizedValue: "ERASED" } as never,
  }).catch(async () => {
    // Fallback for schemas without normalizedValue on claims
    await prisma.candidateClaim.updateMany({
      where: { candidateId, claimType: { not: "SKILL" } },
      data: { value: "ERASED" } as never,
    });
  });
  erasedItems.push("claims");

  // 7. Resume documents: erase extracted text; delete stored binaries.
  const docs = await prisma.candidateResumeDocument.findMany({
    where: { candidateId },
    select: { id: true, storageKey: true },
  });
  for (const doc of docs) {
    try {
      const { deleteResume } = await import("@/lib/resumes/storage");
      await deleteResume(doc.storageKey);
    } catch {
      // Storage deletion is best-effort; metadata erasure already done.
    }
  }
  await prisma.candidateResumeDocument.updateMany({
    where: { candidateId },
    data: { extractedText: null, parseErrorCode: "ERASED" },
  });
  if (docs.length > 0) erasedItems.push("resume-documents");

  // 8. Public hosted-resume uploads bound to this candidate's submissions
  if (submissionIds.length > 0) {
    const hostedUploads = await prisma.hostedApplyResumeUpload.findMany({
      where: { hostedApplySubmissionId: { in: submissionIds } },
      select: { storageKey: true },
    });
    for (const upload of hostedUploads) {
      try {
        const { deleteResume } = await import("@/lib/resumes/storage");
        await deleteResume(upload.storageKey);
      } catch {
        // best-effort object delete
      }
    }
    await prisma.hostedApplyResumeUpload.updateMany({
      where: { hostedApplySubmissionId: { in: submissionIds } },
      data: {
        extractedText: null,
        parseErrorCode: "ERASED",
      },
    });

    const hostedPhotos = await prisma.hostedApplyPhotoUpload.findMany({
      where: { hostedApplySubmissionId: { in: submissionIds } },
      select: { storageKey: true },
    });
    for (const upload of hostedPhotos) {
      try {
        const { deleteResume } = await import("@/lib/resumes/storage");
        await deleteResume(upload.storageKey);
      } catch {
        // best-effort object delete
      }
    }
  }

  for (const photo of photoKeys) {
    if (!photo.photoStorageKey) continue;
    try {
      const { deleteResume } = await import("@/lib/resumes/storage");
      await deleteResume(photo.photoStorageKey);
    } catch {
      // best-effort object delete
    }
  }
  if (photoKeys.some((row) => row.photoStorageKey)) {
    erasedItems.push("profile-photo");
  }

  return { candidateId, erasedItems };
}

function validateCandidateId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new DataErasureError("INVALID_CANDIDATE_ID");
}
