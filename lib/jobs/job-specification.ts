import {
  JobSpecificationVersionStatus,
  Prisma,
  type JobStatus,
  type RoleCategory,
  type SourcingDatabaseSource,
} from "@prisma/client";

import { AssessmentError } from "@/lib/assessments/assessment-errors";
import { snapshotAssessmentQuestionIds } from "@/lib/assessments/assessment-snapshot";
import { parseRequirementChecks } from "@/lib/jobs/requirement-checks";
import { prisma } from "@/lib/prisma";
import { getPrismaErrorCode } from "@/lib/prisma-error";
import {
  JobSpecificationError,
  SPECIFICATION_POSTED_ERROR,
  SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR,
  SPECIFICATION_STALE_ERROR,
  assertSpecificationEditableForLifecycle,
  validateJobRequirementCompletion,
} from "@/lib/validation/job-specification-validation";

export const LEGACY_STRUCTURED_PAYLOAD = {
  schemaVersion: 1,
  legacy: true,
} as const;

type Db = Prisma.TransactionClient | typeof prisma;

export type JobSpecificationScalarFields = {
  title: string;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  location: string | null;
  compensationRange: string | null;
  targetHireDate: Date | null;
  numberOfPositions: number | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  jobDescription: string | null;
  evaluationCriteria: string | null;
  primarySkills: string | null;
};

export const JOB_SPECIFICATION_SCALAR_SELECT = {
  title: true,
  roleCategory: true,
  experienceRange: true,
  location: true,
  compensationRange: true,
  targetHireDate: true,
  numberOfPositions: true,
  mustHaveRequirements: true,
  niceToHaveRequirements: true,
  jobDescription: true,
  evaluationCriteria: true,
  primarySkills: true,
} as const;

const POSTED_OR_LATER = new Set([
  "REQUIREMENT_POSTED",
  "INTERVIEWER_NOTIFIED",
  "SOURCING_SHORTLISTING",
  "BILLING_GENERATED",
]);

export function hasMeaningfulSpecification(
  fields: Partial<JobSpecificationScalarFields>,
) {
  return (
    fields.roleCategory != null ||
    Boolean(fields.experienceRange) ||
    Boolean(fields.location) ||
    Boolean(fields.compensationRange) ||
    fields.targetHireDate != null ||
    fields.numberOfPositions != null ||
    Boolean(fields.mustHaveRequirements) ||
    Boolean(fields.niceToHaveRequirements) ||
    Boolean(fields.jobDescription) ||
    Boolean(fields.evaluationCriteria) ||
    Boolean(fields.primarySkills)
  );
}

export function specFieldsFromRecord(
  record: JobSpecificationScalarFields,
): JobSpecificationScalarFields {
  return {
    title: record.title,
    roleCategory: record.roleCategory,
    experienceRange: record.experienceRange,
    location: record.location,
    compensationRange: record.compensationRange,
    targetHireDate: record.targetHireDate,
    numberOfPositions: record.numberOfPositions,
    mustHaveRequirements: record.mustHaveRequirements,
    niceToHaveRequirements: record.niceToHaveRequirements,
    jobDescription: record.jobDescription,
    evaluationCriteria: record.evaluationCriteria,
    primarySkills: record.primarySkills,
  };
}

export function jobProjectionFromSpec(fields: JobSpecificationScalarFields) {
  return specFieldsFromRecord(fields);
}

/**
 * Dual-read: published version if the Job pointer is set, otherwise Job columns.
 * Never invent a third source. Callers that need in-progress edits should use
 * readEditableJobSpecification.
 */
export function readJobSpecification(job: {
  currentPublishedSpecificationVersion?: JobSpecificationScalarFields | null;
} & JobSpecificationScalarFields): JobSpecificationScalarFields {
  if (job.currentPublishedSpecificationVersion) {
    return specFieldsFromRecord(job.currentPublishedSpecificationVersion);
  }

  return specFieldsFromRecord(job);
}

/**
 * Client/Admin editors: DRAFT, else published, else Job columns.
 */
export function readEditableJobSpecification(job: {
  currentPublishedSpecificationVersion?: JobSpecificationScalarFields | null;
  specificationVersions?: JobSpecificationScalarFields[];
} & JobSpecificationScalarFields): JobSpecificationScalarFields {
  const draft = job.specificationVersions?.[0];
  if (draft) {
    return specFieldsFromRecord(draft);
  }

  return readJobSpecification(job);
}

export function isClientCreateKeyConflict(error: unknown) {
  if (getPrismaErrorCode(error) !== "P2002") {
    return false;
  }
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];
  return fields.some((field) => field.includes("clientCreateIdempotencyKey"));
}

export async function createPostedJobWithPublishedSpecification(input: {
  title: string;
  status: JobStatus;
  companyId: number;
  fields: JobSpecificationScalarFields;
  createdByUserId?: number | null;
  sourcingDatabaseSource?: SourcingDatabaseSource | null;
  sourcingAccessDetails?: string | null;
  structuredPayload?: Prisma.InputJsonValue;
  clientCreateIdempotencyKey?: string | null;
}) {
  const completed = validateJobRequirementCompletion({
    ...input.fields,
    title: input.title,
  });

  const createOnce = () =>
    prisma.$transaction(async (tx) => {
      if (input.clientCreateIdempotencyKey) {
        const existing = await tx.job.findFirst({
          where: {
            companyId: input.companyId,
            clientCreateIdempotencyKey: input.clientCreateIdempotencyKey,
          },
        });
        if (existing) {
          return existing;
        }
      }

      const created = await tx.job.create({
        data: {
          status: input.status,
          companyId: input.companyId,
          requirementLifecycle: "REQUIREMENT_POSTED",
          clientCompletedAt: new Date(),
          sourcingDatabaseSource: input.sourcingDatabaseSource ?? null,
          sourcingAccessDetails: input.sourcingAccessDetails ?? null,
          clientCreateIdempotencyKey: input.clientCreateIdempotencyKey ?? null,
          ...jobProjectionFromSpec(completed),
        },
      });

      const published = await tx.jobSpecificationVersion.create({
        data: {
          jobId: created.id,
          versionNumber: 1,
          status: JobSpecificationVersionStatus.PUBLISHED,
          publishedAt: new Date(),
          createdByUserId: input.createdByUserId ?? null,
          structuredPayload: input.structuredPayload ?? LEGACY_STRUCTURED_PAYLOAD,
          ...completed,
          assessmentQuestionIds: await pinAssessmentQuestionIds(
            completed.roleCategory,
            tx,
          ),
        },
      });

      return tx.job.update({
        where: { id: created.id },
        data: {
          currentPublishedSpecificationVersionId: published.id,
        },
      });
    });

  try {
    return await createOnce();
  } catch (error) {
    if (isClientCreateKeyConflict(error) && input.clientCreateIdempotencyKey) {
      const winner = await prisma.job.findFirst({
        where: {
          companyId: input.companyId,
          clientCreateIdempotencyKey: input.clientCreateIdempotencyKey,
        },
      });
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
}

export async function createDraftSpecificationForJob(input: {
  jobId: number;
  fields: JobSpecificationScalarFields;
  createdByUserId?: number | null;
  db?: Db;
}) {
  const db = input.db ?? prisma;

  return db.jobSpecificationVersion.create({
    data: {
      jobId: input.jobId,
      versionNumber: 1,
      status: JobSpecificationVersionStatus.DRAFT,
      createdByUserId: input.createdByUserId ?? null,
      structuredPayload: LEGACY_STRUCTURED_PAYLOAD,
      ...specFieldsFromRecord(input.fields),
    },
  });
}

async function pinAssessmentQuestionIds(
  roleCategory: RoleCategory,
  db: Prisma.TransactionClient,
) {
  try {
    return await snapshotAssessmentQuestionIds(roleCategory, db);
  } catch (error) {
    if (error instanceof AssessmentError) {
      throw new JobSpecificationError(error.message);
    }
    throw error;
  }
}

async function loadDraft(db: Db, jobId: number) {
  return db.jobSpecificationVersion.findFirst({
    where: {
      jobId,
      status: JobSpecificationVersionStatus.DRAFT,
    },
  });
}

async function nextVersionNumber(db: Db, jobId: number) {
  const latest = await db.jobSpecificationVersion.findFirst({
    where: { jobId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  return (latest?.versionNumber ?? 0) + 1;
}

export async function upsertDraftSpecification(input: {
  jobId: number;
  lifecycle: string;
  fields: JobSpecificationScalarFields;
  expectedUpdatedAt?: Date | null;
  createdByUserId?: number | null;
  requireOptimisticLock?: boolean;
  structuredPayload?: Prisma.InputJsonValue;
  db?: Db;
}) {
  assertSpecificationEditableForLifecycle(input.lifecycle);

  const db = input.db ?? prisma;
  const fields = specFieldsFromRecord(input.fields);
  const requirementChecks = [
    ...parseRequirementChecks(fields.mustHaveRequirements, "mustHaveRequirements"),
    ...parseRequirementChecks(fields.niceToHaveRequirements, "niceToHaveRequirements"),
  ];
  const structuredPayload = {
    ...(input.structuredPayload && typeof input.structuredPayload === "object" && !Array.isArray(input.structuredPayload)
      ? input.structuredPayload
      : { schemaVersion: 1, legacy: true }),
    requirementChecks,
  } as Prisma.InputJsonValue;
  const existing = await loadDraft(db, input.jobId);

  if (existing) {
    if (existing.status !== JobSpecificationVersionStatus.DRAFT) {
      throw new JobSpecificationError(SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR);
    }

    if (input.requireOptimisticLock) {
      if (!input.expectedUpdatedAt) {
        throw new JobSpecificationError(SPECIFICATION_STALE_ERROR);
      }

      if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new JobSpecificationError(SPECIFICATION_STALE_ERROR);
      }
    }

    const updated = await db.jobSpecificationVersion.updateMany({
      where: {
        id: existing.id,
        status: JobSpecificationVersionStatus.DRAFT,
        ...(input.requireOptimisticLock && input.expectedUpdatedAt
          ? { updatedAt: input.expectedUpdatedAt }
          : {}),
      },
      data: {
        ...fields,
        createdByUserId: input.createdByUserId ?? existing.createdByUserId,
        structuredPayload,
      },
    });

    if (updated.count !== 1) {
      throw new JobSpecificationError(SPECIFICATION_STALE_ERROR);
    }

    await db.job.update({
      where: { id: input.jobId },
      data: jobProjectionFromSpec(fields),
    });

    return db.jobSpecificationVersion.findUniqueOrThrow({
      where: { id: existing.id },
    });
  }

  const created = await db.jobSpecificationVersion.create({
    data: {
      jobId: input.jobId,
      versionNumber: await nextVersionNumber(db, input.jobId),
      status: JobSpecificationVersionStatus.DRAFT,
      createdByUserId: input.createdByUserId ?? null,
      structuredPayload,
      ...fields,
    },
  });

  await db.job.update({
    where: { id: input.jobId },
    data: jobProjectionFromSpec(fields),
  });

  return created;
}

export async function publishDraftSpecification(input: {
  jobId: number;
  createdByUserId?: number | null;
  db: Prisma.TransactionClient;
}) {
  const job = await input.db.job.findUniqueOrThrow({
    where: { id: input.jobId },
    select: {
      id: true,
      currentPublishedSpecificationVersionId: true,
      ...JOB_SPECIFICATION_SCALAR_SELECT,
    },
  });

  const draft = await loadDraft(input.db, input.jobId);
  if (draft) {
    const attached = await input.db.jobRequirement.count({
      where: { jobSpecificationVersionId: draft.id },
    });
    if (attached > 0) {
      const approved = await input.db.jobRequirement.count({
        where: {
          jobSpecificationVersionId: draft.id,
          approvalStatus: "APPROVED",
          requirementType: "REQUIRED",
          evidenceType: { not: null },
        },
      });
      if (approved < 1) {
        throw new Error(
          "Publish needs at least one approved required item with an evidence type.",
        );
      }
    }
  }
  const canonical = draft ? specFieldsFromRecord(draft) : specFieldsFromRecord(job);
  const completed = validateJobRequirementCompletion(canonical);

  if (job.currentPublishedSpecificationVersionId) {
    const published = await input.db.jobSpecificationVersion.findUniqueOrThrow({
      where: { id: job.currentPublishedSpecificationVersionId },
    });

    const sameProjection =
      published.title === completed.title &&
      published.roleCategory === completed.roleCategory &&
      published.experienceRange === completed.experienceRange &&
      published.location === completed.location &&
      published.compensationRange === completed.compensationRange &&
      published.numberOfPositions === completed.numberOfPositions &&
      published.mustHaveRequirements === completed.mustHaveRequirements &&
      published.niceToHaveRequirements === completed.niceToHaveRequirements &&
      published.jobDescription === completed.jobDescription &&
      published.evaluationCriteria === completed.evaluationCriteria &&
      published.primarySkills === completed.primarySkills &&
      (published.targetHireDate?.getTime() ?? null) ===
        completed.targetHireDate.getTime();

    if (sameProjection) {
      await input.db.job.update({
        where: { id: input.jobId },
        data: jobProjectionFromSpec(completed),
      });
      return published;
    }
  }

  const published = await input.db.jobSpecificationVersion.create({
    data: {
      jobId: input.jobId,
      versionNumber: await nextVersionNumber(input.db, input.jobId),
      status: JobSpecificationVersionStatus.PUBLISHED,
      publishedAt: new Date(),
      createdByUserId: input.createdByUserId ?? draft?.createdByUserId ?? null,
      structuredPayload:
        (draft?.structuredPayload as Prisma.InputJsonValue | undefined) ??
        LEGACY_STRUCTURED_PAYLOAD,
      ...completed,
      assessmentQuestionIds: await pinAssessmentQuestionIds(
        completed.roleCategory,
        input.db,
      ),
    },
  });

  await input.db.job.update({
    where: { id: input.jobId },
    data: {
      currentPublishedSpecificationVersionId: published.id,
      ...jobProjectionFromSpec(completed),
    },
  });

  if (draft) {
    await input.db.jobSpecificationVersion.delete({
      where: { id: draft.id },
    });
  }

  const publishedJobId = input.jobId;
  queueMicrotask(() => {
    void import("@/lib/talent/rediscovery-service").then((mod) => mod.runTalentRediscovery({ jobId: publishedJobId }).catch(() => undefined));
  });

  return published;
}

export async function assertPublishedSpecificationImmutable(versionId: number) {
  const row = await prisma.jobSpecificationVersion.findUnique({
    where: { id: versionId },
    select: { status: true },
  });

  if (row?.status === JobSpecificationVersionStatus.PUBLISHED) {
    throw new JobSpecificationError(SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR);
  }
}

export async function tryMutatePublishedSpecification(input: {
  versionId: number;
  title: string;
}) {
  const row = await prisma.jobSpecificationVersion.findUnique({
    where: { id: input.versionId },
    select: { status: true },
  });

  if (!row) {
    throw new JobSpecificationError("Specification version not found.");
  }

  if (row.status === JobSpecificationVersionStatus.PUBLISHED) {
    throw new JobSpecificationError(SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR);
  }

  return prisma.jobSpecificationVersion.update({
    where: { id: input.versionId },
    data: { title: input.title },
  });
}

export function isPostedOrLater(lifecycle: string) {
  return POSTED_OR_LATER.has(lifecycle);
}

export { JobSpecificationError, SPECIFICATION_POSTED_ERROR };
