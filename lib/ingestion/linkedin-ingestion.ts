import {
  ApplicationIngestionChannel,
  ApplicationIngestionStatus,
  ApplicationPipelineStatus,
  CandidateStatus,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import {
  ApplicationIngestionError,
  INGESTION_INVALID,
  INGESTION_SPEC_NOT_PUBLISHED,
  INGESTION_TENANT_MISMATCH,
} from "@/lib/ingestion/ingestion-errors";
import { prisma } from "@/lib/prisma";
import { assertApplicationCreatedAtCvPool } from "@/lib/validation/application-validation";
import { assertIngestionTransition } from "@/lib/validation/application-ingestion-validation";

import { captureProviderIngestionEvidence } from "@/lib/ingestion/provider-evidence";
import { LINKEDIN_POSTING_NOT_FOUND } from "@/lib/jobs/distribution/linkedin/errors";

export type LinkedInIngestionInput = {
  externalPostingId: string;
  externalApplicationId: string;
  applicantName: string;
  applicantEmailNormalized?: string | null;
  applicantLocation?: string | null;
  applicantExperienceYears?: number | null;
  externalCandidateId?: string | null;
  companyIdFromBrowser?: unknown;
  jobIdFromBrowser?: unknown;
};

export type SafeLinkedInIngestionEvent = {
  id: number;
  status: ApplicationIngestionStatus;
  sourceChannel: ApplicationIngestionChannel;
  companyId: number;
  jobId: number;
  distributionId: number | null;
  providerPostingId: number | null;
  jobSpecificationVersionId: number;
  candidateId: number | null;
  applicationId: number | null;
  errorCode: string | null;
  externalApplicationId: string | null;
};

function toSafe(event: {
  id: number;
  status: ApplicationIngestionStatus;
  sourceChannel: ApplicationIngestionChannel;
  companyId: number;
  jobId: number;
  distributionId: number | null;
  providerPostingId: number | null;
  jobSpecificationVersionId: number;
  candidateId: number | null;
  applicationId: number | null;
  errorCode: string | null;
  externalApplicationId: string | null;
}): SafeLinkedInIngestionEvent {
  return {
    id: event.id,
    status: event.status,
    sourceChannel: event.sourceChannel,
    companyId: event.companyId,
    jobId: event.jobId,
    distributionId: event.distributionId,
    providerPostingId: event.providerPostingId,
    jobSpecificationVersionId: event.jobSpecificationVersionId,
    candidateId: event.candidateId,
    applicationId: event.applicationId,
    errorCode: event.errorCode,
    externalApplicationId: event.externalApplicationId,
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

async function resolveLinkedInPosting(externalPostingId: string) {
  return prisma.providerPosting.findFirst({
    where: {
      provider: "LINKEDIN",
      externalPostingId,
    },
    include: {
      distribution: {
        select: {
          id: true,
          companyId: true,
          jobId: true,
          jobSpecificationVersionId: true,
          status: true,
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
            },
          },
        },
      },
    },
  });
}

async function ensureReceivedEvent(
  posting: NonNullable<Awaited<ReturnType<typeof resolveLinkedInPosting>>>,
  input: LinkedInIngestionInput,
) {
  const existing = await prisma.applicationIngestionEvent.findFirst({
    where: {
      sourceChannel: ApplicationIngestionChannel.LINKEDIN,
      externalApplicationId: input.externalApplicationId,
      companyId: posting.distribution.companyId,
    },
  });
  if (existing) {
    return existing;
  }

  try {
    return await prisma.applicationIngestionEvent.create({
      data: {
        companyId: posting.distribution.companyId,
        jobId: posting.distribution.jobId,
        sourceChannel: ApplicationIngestionChannel.LINKEDIN,
        distributionId: posting.distribution.id,
        providerPostingId: posting.id,
        externalApplicationId: input.externalApplicationId,
        externalCandidateId: input.externalCandidateId ?? null,
        jobSpecificationVersionId: posting.distribution.jobSpecificationVersionId,
        status: ApplicationIngestionStatus.RECEIVED,
        applicantName: input.applicantName,
        applicantEmailNormalized: input.applicantEmailNormalized ?? null,
        applicantLocation: input.applicantLocation ?? null,
        applicantExperienceYears: input.applicantExperienceYears ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.applicationIngestionEvent.findFirst({
        where: {
          sourceChannel: ApplicationIngestionChannel.LINKEDIN,
          externalApplicationId: input.externalApplicationId,
          companyId: posting.distribution.companyId,
        },
      });
      if (raced) {
        return raced;
      }
      const foreign = await prisma.applicationIngestionEvent.findFirst({
        where: {
          sourceChannel: ApplicationIngestionChannel.LINKEDIN,
          externalApplicationId: input.externalApplicationId,
        },
        select: { id: true, companyId: true },
      });
      if (foreign && foreign.companyId !== posting.distribution.companyId) {
        throw new ApplicationIngestionError(
          INGESTION_TENANT_MISMATCH,
          "TENANT_MISMATCH",
        );
      }
    }
    throw error;
  }
}

/**
 * T85 ingestion for LinkedIn Apply Connect / webhook.
 * Authority is ProviderPosting → JobDistribution → Job → Company.
 * Browser companyId/jobId are ignored. Application.source is not written.
 */
export async function ingestLinkedInApplication(input: LinkedInIngestionInput) {
  void input.companyIdFromBrowser;
  void input.jobIdFromBrowser;

  const name = input.applicantName.trim();
  if (!name) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "APPLICANT_NAME_REQUIRED");
  }
  if (!input.externalPostingId.trim() || !input.externalApplicationId.trim()) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "EXTERNAL_IDS_REQUIRED");
  }

  const posting = await resolveLinkedInPosting(input.externalPostingId.trim());
  if (!posting) {
    throw new ApplicationIngestionError(
      "LinkedIn posting was not found.",
      LINKEDIN_POSTING_NOT_FOUND,
    );
  }

  const distribution = posting.distribution;
  if (
    distribution.job.companyId !== distribution.companyId ||
    distribution.job.id !== distribution.jobId
  ) {
    throw new ApplicationIngestionError(INGESTION_TENANT_MISMATCH, "TENANT_MISMATCH");
  }
  if (distribution.pinnedSpecificationVersion.jobId !== distribution.jobId) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "SPEC_JOB_MISMATCH");
  }
  if (
    distribution.pinnedSpecificationVersion.status !==
    JobSpecificationVersionStatus.PUBLISHED
  ) {
    throw new ApplicationIngestionError(
      INGESTION_SPEC_NOT_PUBLISHED,
      "SPEC_NOT_PUBLISHED",
    );
  }
  if (
    distribution.pinnedSpecificationVersion.id !==
    distribution.jobSpecificationVersionId
  ) {
    throw new ApplicationIngestionError(INGESTION_INVALID, "SPEC_PIN_MISMATCH");
  }

  const event = await ensureReceivedEvent(posting, {
    ...input,
    applicantName: name,
    externalPostingId: input.externalPostingId.trim(),
    externalApplicationId: input.externalApplicationId.trim(),
  });

  if (
    event.status === ApplicationIngestionStatus.PROCESSED &&
    event.applicationId &&
    event.candidateId
  ) {
    return toSafe(event);
  }

  try {
    const processed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      let candidateId = locked.candidateId;
      if (!candidateId) {
        const candidate = await tx.candidate.create({
          data: {
            name,
            role: distribution.job.title,
            experienceYears: input.applicantExperienceYears ?? 0,
            location: input.applicantLocation ?? null,
            status: CandidateStatus.APPLIED,
            companyId: distribution.job.companyId,
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
              jobId: distribution.jobId,
            },
          },
          select: { id: true, companyId: true },
        });
        if (existingApplication) {
          if (existingApplication.companyId !== distribution.companyId) {
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
              jobId: distribution.job.id,
              companyId: distribution.job.companyId,
              status: createStatus,
              source: null,
              expertScore: null,
              rejectionReason: null,
            },
          });
          applicationId = created.id;
        }
      }

      // T91/T96: capture provider-supplied applicant data as INGESTION_EVENT
      // evidence inside the same transaction (provenance chain: Application
      // → IngestionEvent → CandidateEvidence). Runs only under the event row
      // lock and before PROCESSED commits, so it is inherently idempotent.
      await captureProviderIngestionEvidence(tx, {
        companyId: distribution.job.companyId,
        candidateId,
        applicationId,
        ingestionEventId: locked.id,
        occurredAt: locked.createdAt,
        fields: {
          applicantName: locked.applicantName,
          applicantEmailNormalized: locked.applicantEmailNormalized ?? null,
          applicantLocation: locked.applicantLocation ?? null,
          applicantExperienceYears: locked.applicantExperienceYears ?? null,
          externalCandidateId: locked.externalCandidateId ?? null,
          externalApplicationId: locked.externalApplicationId ?? null,
        },
      });

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
          providerPostingId: posting.id,
          distributionId: distribution.id,
          jobSpecificationVersionId: distribution.jobSpecificationVersionId,
          processedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    });

    console.info("[ingestion] linkedin", {
      ok: true,
      eventId: processed.id,
      jobId: processed.jobId,
      distributionId: processed.distributionId,
    });

    return toSafe(processed);
  } catch (error) {
    await prisma.applicationIngestionEvent.updateMany({
      where: {
        id: event.id,
        status: ApplicationIngestionStatus.RECEIVED,
      },
      data: { status: ApplicationIngestionStatus.PROCESSING },
    });
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
    console.info("[ingestion] linkedin", {
      ok: false,
      eventId: event.id,
      jobId: event.jobId,
    });
    throw error;
  }
}
