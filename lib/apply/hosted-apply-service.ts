import {
  ApplyMode,
  HostedApplySubmissionStatus,
  JobDistributionStatus,
  JobSpecificationVersionStatus,
  JobStatus,
  Prisma,
} from "@prisma/client";

import {
  APPLY_LINK_UNAVAILABLE,
  HostedApplyError,
  ROLE_NO_LONGER_ACCEPTING,
} from "@/lib/apply/hosted-apply-errors";
import { toPublicHostedApplyPage } from "@/lib/apply/public-page";
import { ingestHostedApplySubmission } from "@/lib/ingestion/hosted-apply-ingestion";
import { mintAssessmentInviteForApplication } from "@/lib/assessments/assessment-service";
import { hashSecureToken } from "@/lib/auth/secure-token";
import { bindPendingResumeToSubmission } from "@/lib/apply/hosted-resume-service";
import {
  consumeAuthRateLimit,
  rateLimitKeyForDigest,
} from "@/lib/auth/rate-limit";
import { buildPublicDistributionPayload } from "@/lib/jobs/distribution/payload";
import { prisma } from "@/lib/prisma";
import {
  validateHostedApplySubmitBody,
  validateIdempotencyKey,
  validatePublicApplyToken,
} from "@/lib/validation/hosted-apply-validation";

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
            select: publicSpecSelect,
          },
          job: {
            select: {
              status: true,
              company: { select: { name: true } },
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
  const payload = buildPublicDistributionPayload({
    version: row.distribution.pinnedSpecificationVersion,
    applyMode: row.distribution.applyMode,
    applyUrlSnapshot: null,
    includeCompensation: row.distribution.includeCompensation,
    companyDisplayName: row.distribution.job.company.name,
  });

  return toPublicHostedApplyPage(payload);
}

async function ingestReceivedSubmission(submissionId: number) {
  return ingestHostedApplySubmission(submissionId);
}

async function assessmentUrlForApplication(applicationId: number | null) {
  if (!applicationId) {
    return null;
  }

  try {
    const minted = await mintAssessmentInviteForApplication(applicationId);
    return minted?.assessmentUrl ?? null;
  } catch {
    return null;
  }
}

export async function submitHostedApply(input: {
  token: string;
  idempotencyKey: unknown;
  body: unknown;
  resumeClaim?: unknown;
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
        consentAcceptedAt: new Date(),
        status: HostedApplySubmissionStatus.RECEIVED,
      },
      select: { id: true },
    });

    // T104: bind a pending public resume upload (if claimed) to this
    // submission so ingestion can promote it. Fail-closed on invalid
    // claims — a tampered claim must not silently drop the attachment.
    if (input.resumeClaim) {
      await bindPendingResumeToSubmission({
        applyTokenRaw: input.token,
        submissionId: created.id,
        resumeClaim: input.resumeClaim,
      });
    }

    console.info("[hosted-apply] received", {
      ok: true,
      distributionId: row.distribution.id,
      jobId: row.distribution.jobId,
      submissionId: created.id,
    });
    const ingested = await ingestReceivedSubmission(created.id);
    return {
      success: true as const,
      assessmentUrl: await assessmentUrlForApplication(ingested.applicationId),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
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
