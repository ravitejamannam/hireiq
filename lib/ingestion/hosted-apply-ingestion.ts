import { createHash } from "node:crypto";

import {
  ApplicationIngestionChannel,
  ApplicationIngestionStatus,
  ApplicationPipelineStatus,
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  CandidateStatus,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import {
  ApplicationIngestionError,
  INGESTION_INVALID,
  INGESTION_NOT_FOUND,
  INGESTION_SPEC_NOT_PUBLISHED,
  INGESTION_TENANT_MISMATCH,
  PROVIDER_INGESTION_UNAVAILABLE,
} from "@/lib/ingestion/ingestion-errors";
import type { NormalizedApplicationIngestion } from "@/lib/ingestion/normalized-event";
import { prisma } from "@/lib/prisma";
import { assertApplicationCreatedAtCvPool } from "@/lib/validation/application-validation";
import {
  assertIngestionTransition,
  validateIngestionSubmissionId,
} from "@/lib/validation/application-ingestion-validation";

import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";

type Db = Prisma.TransactionClient | typeof prisma;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const submissionInclude = {
  applyToken: {
    select: { id: true, distributionId: true },
  },
  distribution: {
    select: {
      id: true,
      companyId: true,
      jobId: true,
      jobSpecificationVersionId: true,
    },
  },
  job: {
    select: {
      id: true,
      companyId: true,
      title: true,
    },
  },
  pinnedSpecificationVersion: {
    select: {
      id: true,
      jobId: true,
      status: true,
      title: true,
    },
  },
} satisfies Prisma.HostedApplySubmissionInclude;

export type SafeIngestionEvent = {
  id: number;
  status: ApplicationIngestionStatus;
  sourceChannel: ApplicationIngestionChannel;
  companyId: number;
  jobId: number;
  distributionId: number | null;
  jobSpecificationVersionId: number;
  hostedApplySubmissionId: number | null;
  candidateId: number | null;
  applicationId: number | null;
  errorCode: string | null;
};

function toSafe(event: {
  id: number;
  status: ApplicationIngestionStatus;
  sourceChannel: ApplicationIngestionChannel;
  companyId: number;
  jobId: number;
  distributionId: number | null;
  jobSpecificationVersionId: number;
  hostedApplySubmissionId: number | null;
  candidateId: number | null;
  applicationId: number | null;
  errorCode: string | null;
}): SafeIngestionEvent {
  return {
    id: event.id,
    status: event.status,
    sourceChannel: event.sourceChannel,
    companyId: event.companyId,
    jobId: event.jobId,
    distributionId: event.distributionId,
    jobSpecificationVersionId: event.jobSpecificationVersionId,
    hostedApplySubmissionId: event.hostedApplySubmissionId,
    candidateId: event.candidateId,
    applicationId: event.applicationId,
    errorCode: event.errorCode,
  };
}

function safeErrorMessage(error: unknown) {
  if (error instanceof ApplicationIngestionError) {
    return error.message;
  }

  return "Ingestion failed.";
}

function safeErrorCode(error: unknown) {
  if (error instanceof ApplicationIngestionError) {
    return error.code;
  }

  return "INGESTION_FAILED";
}

async function loadSubmission(db: Db, submissionId: number) {
  return db.hostedApplySubmission.findUnique({
    where: { id: submissionId },
    include: submissionInclude,
  });
}

function assertSubmissionIntegrity(
  row: Prisma.HostedApplySubmissionGetPayload<{ include: typeof submissionInclude }>,
) {
  if (row.applyToken.distributionId !== row.distributionId) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "TOKEN_MISMATCH");
  }

  if (
    row.distribution.companyId !== row.companyId ||
    row.distribution.jobId !== row.jobId ||
    row.job.companyId !== row.companyId ||
    row.job.id !== row.jobId
  ) {
    throw new ApplicationIngestionError(INGESTION_TENANT_MISMATCH, "TENANT_MISMATCH");
  }

  if (row.pinnedSpecificationVersion.jobId !== row.jobId) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "SPEC_JOB_MISMATCH");
  }

  if (
    row.pinnedSpecificationVersion.status !==
    JobSpecificationVersionStatus.PUBLISHED
  ) {
    throw new ApplicationIngestionError(
      INGESTION_SPEC_NOT_PUBLISHED,
      "SPEC_NOT_PUBLISHED",
    );
  }

  if (row.distribution.jobSpecificationVersionId !== row.jobSpecificationVersionId) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "SPEC_PIN_MISMATCH");
  }
}

async function ensureReceivedEvent(
  submission: Prisma.HostedApplySubmissionGetPayload<{
    include: typeof submissionInclude;
  }>,
) {
  const existing = await prisma.applicationIngestionEvent.findUnique({
    where: { hostedApplySubmissionId: submission.id },
  });
  if (existing) {
    return existing;
  }

  try {
    return await prisma.applicationIngestionEvent.create({
      data: {
        companyId: submission.companyId,
        jobId: submission.jobId,
        sourceChannel: ApplicationIngestionChannel.HOSTED_APPLY,
        distributionId: submission.distributionId,
        hostedApplySubmissionId: submission.id,
        jobSpecificationVersionId: submission.jobSpecificationVersionId,
        status: ApplicationIngestionStatus.RECEIVED,
        applicantName: submission.name,
        applicantEmailNormalized: submission.emailNormalized,
        applicantPhone: submission.phone,
        applicantLocation: submission.location,
        applicantExperienceYears: submission.experienceYears,
        applicantLinkedInUrl: submission.linkedInUrl,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.applicationIngestionEvent.findUnique({
        where: { hostedApplySubmissionId: submission.id },
      });
      if (raced) {
        return raced;
      }
    }
    throw error;
  }
}

/**
 * Consume a T84 HostedApplySubmission into Candidate + Application.
 * Authority is the submission row, never browser ids.
 *
 * Candidate has no email/phone. T85 V1 does not merge by name/email.
 * Idempotency is one event per HostedApplySubmission.
 */
export async function ingestHostedApplySubmission(submissionId: unknown) {
  const startedAt = Date.now();
  const id = validateIngestionSubmissionId(submissionId);
  const submission = await loadSubmission(prisma, id);
  if (!submission) {
    throw new ApplicationIngestionError(INGESTION_NOT_FOUND, "NOT_FOUND");
  }

  const event = await ensureReceivedEvent(submission);
  if (
    event.status === ApplicationIngestionStatus.PROCESSED &&
    event.applicationId &&
    event.candidateId
  ) {
    return toSafe(event);
  }

  try {
    const processed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "ApplicationIngestionEvent"
        WHERE "id" = ${event.id}
        FOR UPDATE
      `;

      const locked = await tx.applicationIngestionEvent.findUniqueOrThrow({
        where: { id: event.id },
      });

      if (
        locked.status === ApplicationIngestionStatus.PROCESSED &&
        locked.applicationId &&
        locked.candidateId
      ) {
        return locked;
      }

      if (locked.status !== ApplicationIngestionStatus.PROCESSING) {
        assertIngestionTransition(
          locked.status,
          ApplicationIngestionStatus.PROCESSING,
        );
        await tx.applicationIngestionEvent.update({
          where: { id: locked.id },
          data: {
            status: ApplicationIngestionStatus.PROCESSING,
            errorCode: null,
            errorMessage: null,
          },
        });
      }

      const fresh = await loadSubmission(tx, id);
      if (!fresh) {
        throw new ApplicationIngestionError(INGESTION_NOT_FOUND, "NOT_FOUND");
      }
      assertSubmissionIntegrity(fresh);

      let candidateId = locked.candidateId;
      if (!candidateId) {
        const candidate = await tx.candidate.create({
          data: {
            name: fresh.name,
            role: fresh.job.title,
            experienceYears: fresh.experienceYears ?? 0,
            location: fresh.location,
            status: CandidateStatus.APPLIED,
            companyId: fresh.job.companyId,
          },
        });
        candidateId = candidate.id;
      }

      let applicationId = locked.applicationId;
      if (!applicationId) {
        const existingApplication = await tx.application.findUnique({
          where: {
            candidateId_jobId: {
              candidateId,
              jobId: fresh.jobId,
            },
          },
          select: { id: true, status: true, source: true, companyId: true },
        });

        if (existingApplication) {
          if (existingApplication.companyId !== fresh.companyId) {
            throw new ApplicationIngestionError(
              INGESTION_TENANT_MISMATCH,
              "TENANT_MISMATCH",
            );
          }
          applicationId = existingApplication.id;
        } else {
          const createStatus = assertApplicationCreatedAtCvPool(
            ApplicationPipelineStatus.CV_POOL,
          );
          const created = await tx.application.create({
            data: {
              candidateId,
              jobId: fresh.job.id,
              companyId: fresh.job.companyId,
              status: createStatus,
              source: null,
              expertScore: null,
              rejectionReason: null,
            },
          });
          applicationId = created.id;
        }
      }

      // T91: capture the hosted-apply submission as candidate evidence inside
      // the same transaction as ingestion. Idempotent via the unique
      // constraint on hostedApplySubmissionId (one evidence row per submission).
      await createEvidence(
        {
          companyId: fresh.companyId,
          candidateId,
          applicationId,
          sourceType: CandidateEvidenceSourceType.HOSTED_APPLY_SUBMISSION,
          origin: CandidateEvidenceOrigin.CANDIDATE_PROVIDED,
          ingestionEventId: locked.id,
          hostedApplySubmissionId: fresh.id,
          actorUserId: null,
          inlineText: fresh.coverLetter ?? null,
          contentSha256: fresh.coverLetter ? sha256Hex(fresh.coverLetter) : null,
          createdAt: fresh.createdAt,
        },
        tx,
      );

      assertIngestionTransition(
        ApplicationIngestionStatus.PROCESSING,
        ApplicationIngestionStatus.PROCESSED,
      );

      return tx.applicationIngestionEvent.update({
        where: { id: locked.id },
        data: {
          status: ApplicationIngestionStatus.PROCESSED,
          candidateId,
          applicationId,
          companyId: fresh.companyId,
          jobId: fresh.jobId,
          distributionId: fresh.distributionId,
          jobSpecificationVersionId: fresh.jobSpecificationVersionId,
          processedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    });

    console.info("[ingestion] hosted_apply", {
      ok: true,
      durationMs: Date.now() - startedAt,
      eventId: processed.id,
      submissionId: id,
      jobId: processed.jobId,
      distributionId: processed.distributionId,
    });

    return toSafe(processed);
  } catch (error) {
    const failed = await prisma.applicationIngestionEvent.updateMany({
      where: {
        id: event.id,
        status: ApplicationIngestionStatus.RECEIVED,
      },
      data: {
        status: ApplicationIngestionStatus.PROCESSING,
      },
    });
    void failed;

    await prisma.applicationIngestionEvent.updateMany({
      where: {
        id: event.id,
        status: ApplicationIngestionStatus.PROCESSING,
      },
      data: {
        status: ApplicationIngestionStatus.FAILED,
        errorCode: safeErrorCode(error),
        errorMessage: safeErrorMessage(error),
        processedAt: new Date(),
      },
    });

    console.info("[ingestion] hosted_apply", {
      ok: false,
      durationMs: Date.now() - startedAt,
      eventId: event.id,
      submissionId: id,
      jobId: event.jobId,
    });

    throw error;
  }
}

/**
 * Future T86+ entry. Hosted apply is the only implemented channel in T85.
 * companyId in the payload is ignored; HostedApplySubmission is authority.
 */
export async function ingestNormalizedApplication(
  input: NormalizedApplicationIngestion & {
    companyIdFromBrowser?: unknown;
    jobIdFromBrowser?: unknown;
  },
) {
  void input.companyIdFromBrowser;
  void input.jobIdFromBrowser;
  void input.companyId;
  void input.jobId;

  if (input.sourceChannel !== ApplicationIngestionChannel.HOSTED_APPLY) {
    throw new ApplicationIngestionError(
      PROVIDER_INGESTION_UNAVAILABLE,
      "PROVIDER_UNAVAILABLE",
    );
  }

  if (!input.hostedApplySubmissionId) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "SUBMISSION_REQUIRED");
  }

  return ingestHostedApplySubmission(input.hostedApplySubmissionId);
}
