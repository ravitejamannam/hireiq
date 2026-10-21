import {
  ApplyMode,
  HostedApplySubmissionStatus,
  JobDistributionStatus,
  JobSpecificationVersionStatus,
  JobStatus,
} from "@prisma/client";

import { withApplicationWriteGuard } from "@/lib/privacy/erasure-guard";
import {
  APPLY_LINK_UNAVAILABLE,
  HostedApplyError,
  HostedApplyValidationError,
  ROLE_NO_LONGER_ACCEPTING,
} from "@/lib/apply/hosted-apply-errors";
import { toPublicHostedApplyPage } from "@/lib/apply/public-page";
import { ingestHostedApplySubmission } from "@/lib/ingestion/hosted-apply-ingestion";
import { mintAssessmentInviteForApplication } from "@/lib/assessments/assessment-service";
import { hashSecureToken } from "@/lib/auth/secure-token";
import {
  bindPendingResumeToSubmission,
  HostedResumeError,
} from "@/lib/apply/hosted-resume-service";
import {
  bindPendingPhotoToSubmission,
  HostedPhotoError,
} from "@/lib/apply/hosted-photo-service";
import {
  consumeAuthRateLimit,
  rateLimitKeyForDigest,
} from "@/lib/auth/rate-limit";
import { buildPublicDistributionPayload } from "@/lib/jobs/distribution/payload";
import { parseJobPostingNarrative } from "@/lib/jobs/job-posting-view";
import { prisma } from "@/lib/prisma";
import {
  validateHostedApplySubmitBody,
  validateIdempotencyKey,
  validatePublicApplyToken,
} from "@/lib/validation/hosted-apply-validation";
import { gradeKnockouts, parseKnockoutAnswers, parseScreeningAnswers } from "@/lib/apply/knockout";
import { getPrismaErrorCode } from "@/lib/prisma-error";

const publicSpecSelect = {
  status: true,
  title: true,
  roleCategory: true,
  experienceRange: true,
  location: true,
  jobDescription: true,
  mustHaveRequirements: true,
  niceToHaveRequirements: true,
  primarySkills: true,
  numberOfPositions: true,
  compensationRange: true,
} as const;

async function loadApplyTokenContext(token: string) {
  const parsed = validatePublicApplyToken(token);
  if (!parsed) {
    throw new HostedApplyError(APPLY_LINK_UNAVAILABLE, "UNAVAILABLE");
  }

  const row = await prisma.applyToken.findUnique({
    where: { tokenHash: hashSecureToken(parsed) },
    select: {
      id: true,
      revokedAt: true,
      distribution: {
        select: {
          id: true,
          companyId: true,
          jobId: true,
          jobSpecificationVersionId: true,
          applyMode: true,
          status: true,
          includeCompensation: true,
          pinnedSpecificationVersion: {
            select: {
              ...publicSpecSelect,
              structuredPayload: true,
            },
          },
          job: {
            select: {
              status: true,
              company: {
                select: {
                  name: true,
                  publicSlug: true,
                  industry: true,
                  employees: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!row || row.revokedAt) {
    throw new HostedApplyError(APPLY_LINK_UNAVAILABLE, "UNAVAILABLE");
  }

  if (row.distribution.applyMode !== ApplyMode.HIREIQ_HOSTED) {
    throw new HostedApplyError(APPLY_LINK_UNAVAILABLE, "UNAVAILABLE");
  }

  if (
    row.distribution.status !== JobDistributionStatus.PUBLISHED ||
    row.distribution.job.status !== JobStatus.OPEN
  ) {
    throw new HostedApplyError(ROLE_NO_LONGER_ACCEPTING, "CLOSED");
  }

  if (
    row.distribution.pinnedSpecificationVersion.status !==
    JobSpecificationVersionStatus.PUBLISHED
  ) {
    throw new HostedApplyError(APPLY_LINK_UNAVAILABLE, "UNAVAILABLE");
  }

  return row;
}

export async function resolvePublicHostedApply(token: string) {
  const row = await loadApplyTokenContext(token);
  const spec = row.distribution.pinnedSpecificationVersion;
  const payload = buildPublicDistributionPayload({
    version: spec,
    applyMode: row.distribution.applyMode,
    applyUrlSnapshot: null,
    includeCompensation: row.distribution.includeCompensation,
    companyDisplayName: row.distribution.job.company.name,
  });

  return toPublicHostedApplyPage(payload, {
    posting: parseJobPostingNarrative(spec.structuredPayload),
    companyPublicSlug: row.distribution.job.company.publicSlug,
    companyIndustry: row.distribution.job.company.industry,
    companyEmployees: row.distribution.job.company.employees,
  });
}


async function statusTokenForApplication(applicationId: number | null): Promise<string | null> {
  if (!applicationId) return null;
  try {
    const { ensureStatusToken, buildStatusUrl } = await import(
      "@/lib/candidates/status-tracking"
    );
    // A replayed or late request must not give an erased candidate a new status link.
    const guarded = await withApplicationWriteGuard(applicationId, (tx) => ensureStatusToken(applicationId, tx));
    return guarded.ok ? buildStatusUrl(guarded.value) : null;
  } catch {
    return null; // idempotent replay already has one
  }
}


async function ingestReceivedSubmission(submissionId: number) {
  return ingestHostedApplySubmission(submissionId);
}

async function assessmentUrlForApplication(applicationId: number | null) {
  if (!applicationId) {
    return null;
  }

  try {
    // Same rule for the assessment link. Replaying an old submission never reaches an erased candidate.
    const guarded = await withApplicationWriteGuard(applicationId, (tx) => mintAssessmentInviteForApplication(applicationId, tx as never));
    return guarded.ok ? (guarded.value?.assessmentUrl ?? null) : null;
  } catch (error) {
    console.error("[hosted-apply] assessment mint failed", error);
    return null;
  }
}

async function applyKnockoutDecision(input: {
  body: unknown;
  jobId: number;
  companyId: number;
  applicationId: number | null;
}) {
  if (!input.applicationId) return;
  const questions = await prisma.knockoutQuestion.findMany({
    where: { jobId: input.jobId, companyId: input.companyId },
    select: { id: true, expectedAnswer: true },
  });
  if (questions.length === 0) return;
  const graded = gradeKnockouts({
    questions,
    answers: parseKnockoutAnswers(input.body),
  });
  if (!graded.rejectByRule) return;
  // Recorded for the recruiter's "Doesn't meet stated requirements" view; the status is not changed here.
  await prisma.application.updateMany({
    where: { id: input.applicationId, companyId: input.companyId, knockoutFailedAt: null },
    data: { knockoutFailedAt: new Date() },
  });
}

export async function submitHostedApply(input: {
  token: string;
  idempotencyKey: unknown;
  body: unknown;
  resumeClaim?: unknown;
  photoClaim?: unknown;
}) {
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const existingByKey = await prisma.hostedApplySubmission.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  });
  if (existingByKey) {
    const ingested = await ingestReceivedSubmission(existingByKey.id);
    return {
      success: true as const,
      assessmentUrl: await assessmentUrlForApplication(ingested.applicationId),
      statusToken: await statusTokenForApplication(ingested.applicationId),
    };
  }

  const fields = validateHostedApplySubmitBody(input.body);
  const row = await loadApplyTokenContext(input.token);

  await consumeAuthRateLimit({
    name: "hostedApplyPostEmailDistribution",
    key: rateLimitKeyForDigest(
      "emaildist",
      `${hashSecureToken(fields.emailNormalized)}:${row.distribution.id}`,
    ),
  });

  try {
    const created = await prisma.hostedApplySubmission.create({
      data: {
        applyTokenId: row.id,
        distributionId: row.distribution.id,
        companyId: row.distribution.companyId,
        jobId: row.distribution.jobId,
        jobSpecificationVersionId: row.distribution.jobSpecificationVersionId,
        idempotencyKey,
        emailNormalized: fields.emailNormalized,
        name: fields.name,
        phone: fields.phone,
        location: fields.location,
        experienceYears: fields.experienceYears,
        linkedInUrl: fields.linkedInUrl,
        coverLetter: fields.coverLetter,
        profilePayload: {
          ...fields.profile,
          futureRolesConsent: fields.futureRolesConsent,
          aiEvaluationAllowed: fields.aiEvaluationAllowed,
          aiPreference: fields.aiPreference,
          knockoutAnswers: parseKnockoutAnswers(input.body),
          screeningAnswers: parseScreeningAnswers(input.body),
        } as object,
        consentAcceptedAt: new Date(),
        status: HostedApplySubmissionStatus.RECEIVED,
      },
      select: { id: true },
    });

    // T104: bind a pending public resume upload (if claimed) to this
    // submission so ingestion can promote it. Fail-closed on invalid
    // claims — a tampered claim must not silently drop the attachment.
    if (input.resumeClaim) {
      try {
        await bindPendingResumeToSubmission({
          applyTokenRaw: input.token,
          submissionId: created.id,
          resumeClaim: input.resumeClaim,
        });
      } catch (error) {
        if (error instanceof HostedResumeError) {
          throw new HostedApplyValidationError({
            resume: "That resume could not be attached. Upload it again.",
          });
        }
        throw error;
      }
    }

    if (input.photoClaim) {
      try {
        await bindPendingPhotoToSubmission({
          applyTokenRaw: input.token,
          submissionId: created.id,
          photoClaim: input.photoClaim,
        });
      } catch (error) {
        if (error instanceof HostedPhotoError) {
          throw new HostedApplyValidationError({
            photo: "That photo could not be attached. Upload it again.",
          });
        }
        throw error;
      }
    }

    console.info("[hosted-apply] received", {
      ok: true,
      distributionId: row.distribution.id,
      jobId: row.distribution.jobId,
      submissionId: created.id,
    });
    const ingested = await ingestReceivedSubmission(created.id);
    await applyKnockoutDecision({
      body: input.body,
      jobId: row.distribution.jobId,
      companyId: row.distribution.companyId,
      applicationId: ingested.applicationId,
    });
    return {
      success: true as const,
      assessmentUrl: await assessmentUrlForApplication(ingested.applicationId),
      statusToken: await statusTokenForApplication(ingested.applicationId),
    };
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      const raced = await prisma.hostedApplySubmission.findFirst({
        where: {
          OR: [
            { idempotencyKey },
            {
              distributionId: row.distribution.id,
              emailNormalized: fields.emailNormalized,
            },
          ],
        },
        select: { id: true },
      });
      if (raced) {
        const ingested = await ingestReceivedSubmission(raced.id);
        return {
          success: true as const,
          assessmentUrl: await assessmentUrlForApplication(
            ingested.applicationId,
          ),
        };
      }
      return { success: true as const, assessmentUrl: null };
    }

    throw error;
  }
}
