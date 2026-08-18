import {
  ApplyMode,
  DistributionAttemptOperation,
  DistributionAttemptStatus,
  JobDistributionStatus,
  JobSpecificationVersionStatus,
  JobStatus,
  Prisma,
  ProviderPostingStatus,
} from "@prisma/client";

import type { AdapterResult } from "@/lib/jobs/distribution/adapter";
import {
  fingerprintPublicPayload,
  newIdempotencyKey,
} from "@/lib/jobs/distribution/fingerprint";
import { buildPublicDistributionPayload } from "@/lib/jobs/distribution/payload";
import {
  getDistributionAdapter,
  providerRequiresActiveConnection,
} from "@/lib/jobs/distribution/registry";
import { loadActiveConnection } from "@/lib/jobs/distribution/connection-service";
import { prisma } from "@/lib/prisma";
import {
  findLiveApplyToken,
  mintHostedApplyTokenMaterial,
  requirePublicAppOrigin,
  revokeLiveApplyTokens,
} from "@/lib/apply/apply-token";
import { HOSTED_APPLY_APP_URL_REQUIRED } from "@/lib/apply/hosted-apply-errors";
import {
  APPLY_URL_REQUIRED,
  CONNECTION_INACTIVE,
  CONNECTION_REQUIRED,
  DISTRIBUTION_NOT_FOUND,
  DRAFT_CANNOT_DISTRIBUTE,
  DUPLICATE_DISTRIBUTION,
  JOB_NOT_FOUND,
  JOB_NOT_OPEN,
  JobDistributionError,
  MANUAL_DISTRIBUTION_ACTIVE,
  PROVIDER_UNAVAILABLE_MESSAGE,
  PUBLISHED_SPEC_REQUIRED,
  INVALID_TRANSITION,
  assertDistributionTransition,
  assertJobIsDistributable,
  assertPublishedSpecification,
  validateApplyMode,
  validateApplyUrlSnapshot,
  validateDistributionJobId,
  validateDistributionProvider,
  validateIncludeCompensation,
  validateJobDistributionId,
} from "@/lib/validation/job-distribution-validation";

type Db = Prisma.TransactionClient | typeof prisma;

const distributionInclude = {
  pinnedSpecificationVersion: {
    select: {
      id: true,
      jobId: true,
      versionNumber: true,
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
      evaluationCriteria: true,
      targetHireDate: true,
      structuredPayload: true,
      aiProposedJobDescription: true,
    },
  },
  posting: true,
  attempts: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  job: {
    select: {
      id: true,
      companyId: true,
      status: true,
      company: { select: { name: true } },
    },
  },
} satisfies Prisma.JobDistributionInclude;

export type SafeJobDistribution = {
  id: number;
  jobId: number;
  companyId: number;
  provider: Prisma.JobDistributionGetPayload<{
    select: { provider: true };
  }>["provider"];
  status: JobDistributionStatus;
  applyMode: ApplyMode;
  applyUrlSnapshot: string | null;
  includeCompensation: boolean;
  jobSpecificationVersionId: number;
  specificationVersionNumber: number;
  posting: {
    providerStatus: ProviderPostingStatus;
    externalPostingId: string | null;
    externalUrl: string | null;
  } | null;
  latestAttempt: {
    id: number;
    operation: DistributionAttemptOperation;
    status: DistributionAttemptStatus;
    errorCode: string | null;
    errorMessage: string | null;
    completedAt: Date | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

function latestAttemptDto(
  attempts: Prisma.DistributionAttemptGetPayload<{
    select: {
      id: true;
      operation: true;
      status: true;
      normalizedError: true;
      completedAt: true;
    };
  }>[],
): SafeJobDistribution["latestAttempt"] {
  const latest = attempts[0];
  if (!latest) {
    return null;
  }

  const error =
    latest.normalizedError &&
    typeof latest.normalizedError === "object" &&
    !Array.isArray(latest.normalizedError)
      ? (latest.normalizedError as { code?: unknown; message?: unknown })
      : null;

  return {
    id: latest.id,
    operation: latest.operation,
    status: latest.status,
    errorCode: typeof error?.code === "string" ? error.code : null,
    errorMessage: typeof error?.message === "string" ? error.message : null,
    completedAt: latest.completedAt,
  };
}

function toSafeDistribution(
  row: Prisma.JobDistributionGetPayload<{ include: typeof distributionInclude }>,
): SafeJobDistribution {
  return {
    id: row.id,
    jobId: row.jobId,
    companyId: row.companyId,
    provider: row.provider,
    status: row.status,
    applyMode: row.applyMode,
    applyUrlSnapshot: row.applyUrlSnapshot,
    includeCompensation: row.includeCompensation,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    specificationVersionNumber: row.pinnedSpecificationVersion.versionNumber,
    posting: row.posting
      ? {
          providerStatus: row.posting.providerStatus,
          externalPostingId: row.posting.externalPostingId,
          externalUrl: row.posting.externalUrl,
        }
      : null,
    latestAttempt: latestAttemptDto(row.attempts),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadDistributionRow(db: Db, id: number, companyId: number) {
  return db.jobDistribution.findFirst({
    where: { id, companyId },
    include: distributionInclude,
  });
}

export async function listJobDistributionsForJob(input: {
  jobId: number;
  companyId: number;
}) {
  const jobId = validateDistributionJobId(input.jobId);
  const rows = await prisma.jobDistribution.findMany({
    where: { jobId, companyId: input.companyId },
    include: distributionInclude,
    orderBy: [{ provider: "asc" }, { createdAt: "desc" }],
  });

  return rows.map(toSafeDistribution);
}

export async function createJobDistributionForCompany(input: {
  companyId: number;
  jobId: unknown;
  provider: unknown;
  applyMode: unknown;
  applyUrl?: unknown;
  includeCompensation?: unknown;
  /** Ignored if present. Server pins current published specification. */
  companyIdFromBrowser?: unknown;
  specificationVersionId?: unknown;
}) {
  void input.companyIdFromBrowser;
  void input.specificationVersionId;

  const jobId = validateDistributionJobId(input.jobId);
  const provider = validateDistributionProvider(input.provider);
  const applyMode = validateApplyMode(input.applyMode);
  const applyUrlSnapshot = validateApplyUrlSnapshot(applyMode, input.applyUrl);
  const includeCompensation = validateIncludeCompensation(
    input.includeCompensation,
  );

  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: input.companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      currentPublishedSpecificationVersionId: true,
    },
  });

  if (!job) {
    throw new JobDistributionError(JOB_NOT_FOUND);
  }

  assertJobIsDistributable(job);

  const version = await prisma.jobSpecificationVersion.findUnique({
    where: { id: job.currentPublishedSpecificationVersionId! },
    select: { id: true, jobId: true, status: true },
  });

  const pinned = assertPublishedSpecification(version, job.id);

  let providerConnectionId: number | null = null;
  if (providerRequiresActiveConnection(provider)) {
    const connection = await loadActiveConnection({
      companyId: input.companyId,
      provider,
    });
    if (!connection) {
      throw new JobDistributionError(CONNECTION_REQUIRED);
    }
    if (connection.status !== "ACTIVE") {
      throw new JobDistributionError(CONNECTION_INACTIVE);
    }
    providerConnectionId = connection.id;
  }

  try {
    const created = await prisma.jobDistribution.create({
      data: {
        companyId: job.companyId,
        jobId: job.id,
        jobSpecificationVersionId: pinned.id,
        provider,
        providerConnectionId,
        status: JobDistributionStatus.READY,
        applyMode,
        applyUrlSnapshot,
        includeCompensation,
      },
      include: distributionInclude,
    });

    return toSafeDistribution(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      if (applyMode === ApplyMode.HIREIQ_HOSTED && provider === "MANUAL") {
        throw new JobDistributionError(MANUAL_DISTRIBUTION_ACTIVE);
      }
      throw new JobDistributionError(DUPLICATE_DISTRIBUTION);
    }
    throw error;
  }
}

function buildPayloadForRow(
  row: Prisma.JobDistributionGetPayload<{ include: typeof distributionInclude }>,
) {
  const version = row.pinnedSpecificationVersion;
  if (version.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new JobDistributionError(DRAFT_CANNOT_DISTRIBUTE);
  }

  return buildPublicDistributionPayload({
    version,
    applyMode: row.applyMode,
    applyUrlSnapshot: row.applyUrlSnapshot,
    includeCompensation: row.includeCompensation,
    companyDisplayName: row.job.company.name,
  });
}

function errorFromAdapter(result: Extract<AdapterResult, { ok: false }>) {
  return {
    code: result.code,
    retryable: result.retryable,
    message: result.message,
  };
}

async function persistAttemptOutcome(input: {
  distributionId: number;
  companyId: number;
  attemptId: number;
  fromStatus: JobDistributionStatus;
  successStatus: JobDistributionStatus;
  result: AdapterResult;
  provider: Prisma.JobDistributionGetPayload<{
    select: { provider: true };
  }>["provider"];
  applyMode: ApplyMode;
  hostedApplyToken?: { tokenHash: string; applyUrl: string };
}) {
  const completedAt = new Date();
  const result = input.result;

  if (result.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.distributionAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: DistributionAttemptStatus.SUCCEEDED,
          sanitizedResponse: {
            externalPostingId: result.externalPostingId,
            externalUrl: result.externalUrl,
            providerStatus: result.providerStatus,
          },
          completedAt,
        },
      });

      const persistPosting =
        input.applyMode !== ApplyMode.HIREIQ_HOSTED ||
        Boolean(result.externalPostingId);

      if (persistPosting) {
        const existingPosting = await tx.providerPosting.findUnique({
          where: { distributionId: input.distributionId },
          select: { externalPostingId: true },
        });
        await tx.providerPosting.upsert({
          where: { distributionId: input.distributionId },
          create: {
            distributionId: input.distributionId,
            provider: input.provider,
            externalPostingId: result.externalPostingId,
            externalUrl: result.externalUrl,
            providerStatus: result.providerStatus,
            providerCreatedAt: completedAt,
            providerUpdatedAt: completedAt,
          },
          update: {
            ...(existingPosting?.externalPostingId
              ? {}
              : { externalPostingId: result.externalPostingId }),
            externalUrl: result.externalUrl,
            providerStatus: result.providerStatus,
            providerUpdatedAt: completedAt,
          },
        });
      }

      if (input.hostedApplyToken) {
        await tx.applyToken.create({
          data: {
            distributionId: input.distributionId,
            tokenHash: input.hostedApplyToken.tokenHash,
          },
        });
      }

      const transition = await tx.jobDistribution.updateMany({
        where: {
          id: input.distributionId,
          companyId: input.companyId,
          status: input.fromStatus,
        },
        data: {
          status: input.successStatus,
          ...(input.hostedApplyToken
            ? { applyUrlSnapshot: input.hostedApplyToken.applyUrl }
            : {}),
        },
      });

      if (transition.count !== 1) {
        throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
      }
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.distributionAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: result.retryable
            ? DistributionAttemptStatus.FAILED_RETRYABLE
            : DistributionAttemptStatus.FAILED_PERMANENT,
          normalizedError: errorFromAdapter(result),
          completedAt,
        },
      });

      if (input.fromStatus === JobDistributionStatus.PUBLISHING) {
        await tx.jobDistribution.updateMany({
          where: {
            id: input.distributionId,
            companyId: input.companyId,
            status: JobDistributionStatus.PUBLISHING,
          },
          data: { status: JobDistributionStatus.FAILED },
        });
      } else if (input.fromStatus === JobDistributionStatus.CLOSING) {
        await tx.jobDistribution.updateMany({
          where: {
            id: input.distributionId,
            companyId: input.companyId,
            status: JobDistributionStatus.CLOSING,
          },
          data: { status: JobDistributionStatus.FAILED },
        });
      }
    });
  }

  const fresh = await loadDistributionRow(
    prisma,
    input.distributionId,
    input.companyId,
  );
  if (!fresh) {
    throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
  }
  return toSafeDistribution(fresh);
}

async function beginOperation(input: {
  companyId: number;
  distributionId: number;
  allowedFrom: JobDistributionStatus[];
  nextStatus: JobDistributionStatus;
  operation: DistributionAttemptOperation;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "JobDistribution"
      WHERE "id" = ${input.distributionId} AND "companyId" = ${input.companyId}
      FOR UPDATE
    `;

    const row = await loadDistributionRow(
      tx,
      input.distributionId,
      input.companyId,
    );
    if (!row) {
      throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
    }

    if (row.job.status !== JobStatus.OPEN && input.operation === "CREATE") {
      throw new JobDistributionError(JOB_NOT_OPEN);
    }

    if (row.pinnedSpecificationVersion.status !== "PUBLISHED") {
      throw new JobDistributionError(DRAFT_CANNOT_DISTRIBUTE);
    }

    if (!input.allowedFrom.includes(row.status)) {
      if (
        input.operation === DistributionAttemptOperation.CREATE &&
        row.status === JobDistributionStatus.PUBLISHED
      ) {
        return { row, attemptId: null as number | null, alreadyComplete: true };
      }
      throw new JobDistributionError("Invalid distribution status transition.");
    }

    assertDistributionTransition(row.status, input.nextStatus);

    const moved = await tx.jobDistribution.updateMany({
      where: {
        id: row.id,
        companyId: input.companyId,
        status: row.status,
      },
      data: { status: input.nextStatus },
    });

    if (moved.count !== 1) {
      throw new JobDistributionError(
        "Distribution is no longer available for this action.",
      );
    }

    const payload = buildPayloadForRow(row);
    const attempt = await tx.distributionAttempt.create({
      data: {
        distributionId: row.id,
        operation: input.operation,
        idempotencyKey: newIdempotencyKey(
          `dist-${row.id}-${input.operation.toLowerCase()}`,
        ),
        requestFingerprint: fingerprintPublicPayload(payload),
        status: DistributionAttemptStatus.IN_FLIGHT,
      },
    });

    return { row, attemptId: attempt.id, alreadyComplete: false };
  });
}

export async function publishJobDistributionForCompany(input: {
  companyId: number;
  distributionId: unknown;
}) {
  const distributionId = validateJobDistributionId(input.distributionId);
  const started = await beginOperation({
    companyId: input.companyId,
    distributionId,
    allowedFrom: [JobDistributionStatus.READY, JobDistributionStatus.FAILED],
    nextStatus: JobDistributionStatus.PUBLISHING,
    operation: DistributionAttemptOperation.CREATE,
  });

  if (started.alreadyComplete) {
    return toSafeDistribution(started.row);
  }

  const adapter = getDistributionAdapter(started.row.provider);
  const connection = await loadActiveConnection({
    companyId: input.companyId,
    provider: started.row.provider,
  });

  const persistPublish = (
    result: AdapterResult,
    hostedApplyToken?: { tokenHash: string; applyUrl: string },
  ) =>
    persistAttemptOutcome({
      distributionId,
      companyId: input.companyId,
      attemptId: started.attemptId!,
      fromStatus: JobDistributionStatus.PUBLISHING,
      successStatus: JobDistributionStatus.PUBLISHED,
      result,
      provider: started.row.provider,
      applyMode: started.row.applyMode,
      hostedApplyToken,
    });

  if (providerRequiresActiveConnection(started.row.provider) && !connection) {
    const result: AdapterResult = {
      ok: false,
      retryable: false,
      code: "CONNECTION_REQUIRED",
      message: CONNECTION_REQUIRED,
    };
    return persistPublish(result);
  }

  if (started.row.applyMode === ApplyMode.EXTERNAL_URL && !started.row.applyUrlSnapshot) {
    return persistPublish({
      ok: false,
      retryable: false,
      code: "APPLY_URL_REQUIRED",
      message: APPLY_URL_REQUIRED,
    });
  }

  let hostedApplyToken: { tokenHash: string; applyUrl: string } | undefined;
  let hostedApplyUrl = started.row.applyUrlSnapshot;
  if (started.row.applyMode === ApplyMode.HIREIQ_HOSTED) {
    try {
      requirePublicAppOrigin();
    } catch {
      return persistPublish({
        ok: false,
        retryable: false,
        code: "APP_URL_REQUIRED",
        message: HOSTED_APPLY_APP_URL_REQUIRED,
      });
    }

    const live = await findLiveApplyToken(distributionId);
    if (live && started.row.applyUrlSnapshot) {
      hostedApplyUrl = started.row.applyUrlSnapshot;
    } else {
      if (live) {
        await revokeLiveApplyTokens(distributionId);
      }
      hostedApplyToken = mintHostedApplyTokenMaterial();
      hostedApplyUrl = hostedApplyToken.applyUrl;
    }
  }

  const posting = started.row.posting;
  if (
    posting?.externalPostingId &&
    adapter.capabilities().fetchPosting
  ) {
    const fetched = await adapter.fetchPosting({
      externalPostingId: posting.externalPostingId,
      connection,
    });
    if (fetched.ok) {
      return persistPublish(fetched, hostedApplyToken);
    }
  }

  const result = await adapter.publish({
    payload: buildPublicDistributionPayload({
      version: started.row.pinnedSpecificationVersion,
      applyMode: started.row.applyMode,
      applyUrlSnapshot: hostedApplyUrl,
      includeCompensation: started.row.includeCompensation,
      companyDisplayName: started.row.job.company.name,
    }),
    idempotencyKey: `dist-${distributionId}-create`,
    distributionId,
    connection,
  });

  return persistPublish(result, result.ok ? hostedApplyToken : undefined);
}

export async function retryJobDistributionForCompany(input: {
  companyId: number;
  distributionId: unknown;
}) {
  const distributionId = validateJobDistributionId(input.distributionId);
  const current = await loadDistributionRow(
    prisma,
    distributionId,
    input.companyId,
  );
  if (!current) {
    throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
  }

  if (current.status === JobDistributionStatus.PUBLISHING) {
    const latest = current.attempts[0];
    const adapter = getDistributionAdapter(current.provider);
    if (
      latest?.status === DistributionAttemptStatus.IN_FLIGHT &&
      current.posting?.externalPostingId &&
      adapter.capabilities().fetchPosting
    ) {
      const connection = await loadActiveConnection({
        companyId: input.companyId,
        provider: current.provider,
      });
      const fetched = await adapter.fetchPosting({
        externalPostingId: current.posting.externalPostingId,
        connection,
      });
      if (fetched.ok) {
        await prisma.distributionAttempt.update({
          where: { id: latest.id },
          data: {
            status: DistributionAttemptStatus.SUCCEEDED,
            sanitizedResponse: {
              externalPostingId: fetched.externalPostingId,
              externalUrl: fetched.externalUrl,
              providerStatus: fetched.providerStatus,
            },
            completedAt: new Date(),
          },
        });
        await prisma.jobDistribution.updateMany({
          where: {
            id: distributionId,
            companyId: input.companyId,
            status: JobDistributionStatus.PUBLISHING,
          },
          data: { status: JobDistributionStatus.PUBLISHED },
        });
        const fresh = await loadDistributionRow(
          prisma,
          distributionId,
          input.companyId,
        );
        if (!fresh) {
          throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
        }
        return toSafeDistribution(fresh);
      }
    }

    if (latest?.status === DistributionAttemptStatus.IN_FLIGHT) {
      await prisma.distributionAttempt.update({
        where: { id: latest.id },
        data: {
          status: adapter.capabilities().fetchPosting
            ? DistributionAttemptStatus.FAILED_RETRYABLE
            : DistributionAttemptStatus.FAILED_PERMANENT,
          normalizedError: {
            code: adapter.capabilities().fetchPosting
              ? "RECONCILE_FAILED"
              : "PROVIDER_UNAVAILABLE",
            retryable: adapter.capabilities().fetchPosting,
            message: adapter.capabilities().fetchPosting
              ? "Could not confirm the previous publish. Retry was not a blind CREATE."
              : PROVIDER_UNAVAILABLE_MESSAGE,
          },
          completedAt: new Date(),
        },
      });
      await prisma.jobDistribution.updateMany({
        where: {
          id: distributionId,
          companyId: input.companyId,
          status: JobDistributionStatus.PUBLISHING,
        },
        data: { status: JobDistributionStatus.FAILED },
      });
    }
  }

  return publishJobDistributionForCompany(input);
}

export async function pauseJobDistributionForCompany(input: {
  companyId: number;
  distributionId: unknown;
}) {
  const distributionId = validateJobDistributionId(input.distributionId);
  const started = await beginOperation({
    companyId: input.companyId,
    distributionId,
    allowedFrom: [JobDistributionStatus.PUBLISHED],
    nextStatus: JobDistributionStatus.PAUSED,
    operation: DistributionAttemptOperation.PAUSE,
  });

  const adapter = getDistributionAdapter(started.row.provider);
  const connection = await loadActiveConnection({
    companyId: input.companyId,
    provider: started.row.provider,
  });
  const result = await adapter.pause({
    payload: buildPayloadForRow(started.row),
    idempotencyKey: `dist-${distributionId}-pause`,
    distributionId,
    connection,
  });

  if (!result.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.distributionAttempt.update({
        where: { id: started.attemptId! },
        data: {
          status: result.retryable
            ? DistributionAttemptStatus.FAILED_RETRYABLE
            : DistributionAttemptStatus.FAILED_PERMANENT,
          normalizedError: errorFromAdapter(result),
          completedAt: new Date(),
        },
      });
      await tx.jobDistribution.updateMany({
        where: {
          id: distributionId,
          companyId: input.companyId,
          status: JobDistributionStatus.PAUSED,
        },
        data: { status: JobDistributionStatus.PUBLISHED },
      });
    });
    const fresh = await loadDistributionRow(
      prisma,
      distributionId,
      input.companyId,
    );
    if (!fresh) {
      throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
    }
    return toSafeDistribution(fresh);
  }

  await prisma.distributionAttempt.update({
    where: { id: started.attemptId! },
    data: {
      status: DistributionAttemptStatus.SUCCEEDED,
      sanitizedResponse: {
        providerStatus: result.providerStatus,
        externalUrl: result.externalUrl,
      },
      completedAt: new Date(),
    },
  });
  if (started.row.posting) {
    await prisma.providerPosting.update({
      where: { distributionId },
      data: {
        providerStatus: result.providerStatus,
        externalUrl: result.externalUrl,
        providerUpdatedAt: new Date(),
      },
    });
  }

  const fresh = await loadDistributionRow(
    prisma,
    distributionId,
    input.companyId,
  );
  if (!fresh) {
    throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
  }
  return toSafeDistribution(fresh);
}

export async function closeJobDistributionForCompany(input: {
  companyId: number;
  distributionId: unknown;
}) {
  const distributionId = validateJobDistributionId(input.distributionId);
  const current = await loadDistributionRow(
    prisma,
    distributionId,
    input.companyId,
  );
  if (!current) {
    throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
  }

  if (
    current.status === JobDistributionStatus.READY ||
    current.status === JobDistributionStatus.FAILED ||
    current.status === JobDistributionStatus.DISABLED
  ) {
    assertDistributionTransition(current.status, JobDistributionStatus.CLOSED);
    await prisma.$transaction(async (tx) => {
      await tx.jobDistribution.updateMany({
        where: {
          id: distributionId,
          companyId: input.companyId,
          status: current.status,
        },
        data: { status: JobDistributionStatus.CLOSED },
      });
      await revokeLiveApplyTokens(distributionId, tx);
    });
    const fresh = await loadDistributionRow(
      prisma,
      distributionId,
      input.companyId,
    );
    if (!fresh) {
      throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
    }
    return toSafeDistribution(fresh);
  }

  const started = await beginOperation({
    companyId: input.companyId,
    distributionId,
    allowedFrom: [JobDistributionStatus.PUBLISHED, JobDistributionStatus.PAUSED],
    nextStatus: JobDistributionStatus.CLOSING,
    operation: DistributionAttemptOperation.CLOSE,
  });

  const adapter = getDistributionAdapter(started.row.provider);
  const connection = await loadActiveConnection({
    companyId: input.companyId,
    provider: started.row.provider,
  });
  const result = await adapter.close({
    payload: buildPayloadForRow(started.row),
    idempotencyKey: `dist-${distributionId}-close`,
    distributionId,
    connection,
  });

  const closed = await persistAttemptOutcome({
    distributionId,
    companyId: input.companyId,
    attemptId: started.attemptId!,
    fromStatus: JobDistributionStatus.CLOSING,
    successStatus: JobDistributionStatus.CLOSED,
    result,
    provider: started.row.provider,
    applyMode: started.row.applyMode,
  });
  if (closed.status === JobDistributionStatus.CLOSED) {
    await revokeLiveApplyTokens(distributionId);
  }
  return closed;
}

export async function updateJobDistributionForCompany(input: {
  companyId: number;
  distributionId: unknown;
}) {
  const distributionId = validateJobDistributionId(input.distributionId);
  const row = await loadDistributionRow(prisma, distributionId, input.companyId);
  if (!row) {
    throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
  }
  if (
    row.status !== JobDistributionStatus.PUBLISHED &&
    row.status !== JobDistributionStatus.PAUSED
  ) {
    throw new JobDistributionError(INVALID_TRANSITION);
  }

  const adapter = getDistributionAdapter(row.provider);
  const connection = await loadActiveConnection({
    companyId: input.companyId,
    provider: row.provider,
  });
  const payload = buildPayloadForRow(row);
  const attempt = await prisma.distributionAttempt.create({
    data: {
      distributionId: row.id,
      operation: DistributionAttemptOperation.UPDATE,
      idempotencyKey: newIdempotencyKey(`dist-${row.id}-update`),
      requestFingerprint: fingerprintPublicPayload(payload),
      status: DistributionAttemptStatus.IN_FLIGHT,
    },
  });

  const result = await adapter.update({
    payload,
    idempotencyKey: `dist-${distributionId}-update`,
    distributionId,
    connection,
  });

  return persistAttemptOutcome({
    distributionId,
    companyId: input.companyId,
    attemptId: attempt.id,
    fromStatus: row.status,
    successStatus: row.status,
    result,
    provider: row.provider,
    applyMode: row.applyMode,
  });
}

export async function reconcileJobDistributionForCompany(input: {
  companyId: number;
  distributionId: unknown;
}) {
  const distributionId = validateJobDistributionId(input.distributionId);
  const row = await loadDistributionRow(prisma, distributionId, input.companyId);
  if (!row) {
    throw new JobDistributionError(DISTRIBUTION_NOT_FOUND);
  }

  const adapter = getDistributionAdapter(row.provider);
  if (!adapter.capabilities().fetchPosting || !row.posting?.externalPostingId) {
    throw new JobDistributionError(
      "This distribution cannot be reconciled without a provider posting id.",
    );
  }

  const connection = await loadActiveConnection({
    companyId: input.companyId,
    provider: row.provider,
  });
  const payload = buildPayloadForRow(row);
  const attempt = await prisma.distributionAttempt.create({
    data: {
      distributionId: row.id,
      operation: DistributionAttemptOperation.FETCH,
      idempotencyKey: newIdempotencyKey(`dist-${row.id}-fetch`),
      requestFingerprint: fingerprintPublicPayload(payload),
      status: DistributionAttemptStatus.IN_FLIGHT,
    },
  });

  const result = await adapter.fetchPosting({
    externalPostingId: row.posting.externalPostingId,
    connection,
  });

  return persistAttemptOutcome({
    distributionId,
    companyId: input.companyId,
    attemptId: attempt.id,
    fromStatus: row.status,
    successStatus: row.status,
    result,
    provider: row.provider,
    applyMode: row.applyMode,
  });
}

export { PUBLISHED_SPEC_REQUIRED, DRAFT_CANNOT_DISTRIBUTE };
