import {
  JobIntelligenceExtractorType,
  JobSpecificationVersionStatus,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  JOB_INTELLIGENCE_GENERIC_ERROR,
  JOB_INTELLIGENCE_IN_PROGRESS,
  JOB_INTELLIGENCE_INTERNAL_ERROR,
  JOB_INTELLIGENCE_NOT_FOUND,
  JOB_INTELLIGENCE_SPEC_JOB_MISMATCH,
  JOB_INTELLIGENCE_SPEC_NOT_FOUND,
  JOB_INTELLIGENCE_SPEC_NOT_PUBLISHED,
  JobIntelligenceError,
} from "@/lib/jobs/intelligence/job-intelligence-errors";
import {
  extractJobRequirements,
  hashJobIntelligenceInput,
} from "@/lib/jobs/intelligence/job-intelligence-extractor";
import type {
  JobIntelligencePageData,
  SafeJobIntelligenceRun,
  SafeJobRequirement,
} from "@/lib/jobs/intelligence/job-intelligence-types";
import { JOB_INTELLIGENCE_EXTRACTOR_VERSION } from "@/lib/jobs/intelligence/job-intelligence-versions";
import { ONTOLOGY_VERSION } from "@/lib/ontology/skill-alias-catalog";
import { prisma } from "@/lib/prisma";
import {
  createJobIntelligenceRun,
  createJobRequirements,
  findCompletedJobIntelligenceRun,
  findLatestRunningJobIntelligenceRun,
  findSkillConceptId,
  getJobIntelligenceRunWithRows,
  getPublishedSpecForJobIntelligence,
  listJobIntelligenceRunsForJob,
  listPublishedSpecsForJob,
  markJobIntelligenceRunCompleted,
  markJobIntelligenceRunFailed,
  type JobIntelligenceIdempotencyKey,
  type JobIntelligenceRunRow,
} from "@/lib/repositories/job-intelligence-repository";
import {
  JobIntelligenceValidationError,
  rejectForbiddenJobIntelligenceFields,
  validateJobIntelligenceJobId,
  validateJobIntelligenceSpecificationId,
} from "@/lib/validation/job-intelligence-validation";

export const STALE_JOB_INTELLIGENCE_RUNNING_MS = 60_000;

function notFound(): never {
  throw new JobIntelligenceError("Resource not found.", JOB_INTELLIGENCE_NOT_FOUND);
}

export function assertCanManageJobIntelligence(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireJobIntelligenceAdmin() {
  const user = await requireAdmin();
  assertCanManageJobIntelligence(user.role);
  return user;
}

function toSafeRequirement(
  row: JobIntelligenceRunRow["requirements"][number],
): SafeJobRequirement {
  return {
    id: row.id,
    companyId: row.companyId,
    runId: row.runId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    stableKey: row.stableKey,
    sourceField: row.sourceField,
    sourceText: row.sourceText,
    sourceSpanStart: row.sourceSpanStart,
    sourceSpanEnd: row.sourceSpanEnd,
    category: row.category,
    normalizedValue: row.normalizedValue,
    skillConceptId: row.skillConceptId,
    provenance: row.provenance,
    uncertainty: row.uncertainty,
    createdAt: row.createdAt,
  };
}

function toSafeRun(row: JobIntelligenceRunRow): SafeJobIntelligenceRun {
  return {
    id: row.id,
    companyId: row.companyId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    status: row.status,
    extractorType: row.extractorType,
    extractorVersion: row.extractorVersion,
    inputHash: row.inputHash,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    requirements: row.requirements.map(toSafeRequirement),
  };
}

export async function executeRunJobIntelligence(input: {
  jobId: number;
  jobSpecificationVersionId: number;
}): Promise<SafeJobIntelligenceRun> {
  const spec = await getPublishedSpecForJobIntelligence(
    input.jobSpecificationVersionId,
  );
  if (!spec) {
    throw new JobIntelligenceError(
      "Specification not found.",
      JOB_INTELLIGENCE_SPEC_NOT_FOUND,
    );
  }
  if (spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new JobIntelligenceError(
      "A published specification is required.",
      JOB_INTELLIGENCE_SPEC_NOT_PUBLISHED,
    );
  }
  if (spec.jobId !== input.jobId || spec.job.id !== input.jobId) {
    throw new JobIntelligenceError(
      "Specification does not belong to this job.",
      JOB_INTELLIGENCE_SPEC_JOB_MISMATCH,
    );
  }

  const extractionInput = {
    title: spec.title,
    primarySkills: spec.primarySkills,
    mustHaveRequirements: spec.mustHaveRequirements,
    niceToHaveRequirements: spec.niceToHaveRequirements,
    location: spec.location,
    experienceRange: spec.experienceRange,
    jobDescription: spec.jobDescription,
    evaluationCriteria: spec.evaluationCriteria,
  };
  const inputHash = hashJobIntelligenceInput(extractionInput);
  const key: JobIntelligenceIdempotencyKey = {
    companyId: spec.job.companyId,
    jobId: spec.job.id,
    jobSpecificationVersionId: spec.id,
    extractorType: JobIntelligenceExtractorType.DETERMINISTIC_SPEC_V1,
    extractorVersion: JOB_INTELLIGENCE_EXTRACTOR_VERSION,
    inputHash,
  };

  const existing = await findCompletedJobIntelligenceRun(key);
  if (existing) {
    return toSafeRun(existing);
  }

  const running = await findLatestRunningJobIntelligenceRun(key);
  if (running) {
    const ageMs = Date.now() - running.createdAt.getTime();
    if (ageMs < STALE_JOB_INTELLIGENCE_RUNNING_MS) {
      throw new JobIntelligenceError(
        "Job intelligence is already running.",
        JOB_INTELLIGENCE_IN_PROGRESS,
      );
    }
    await markJobIntelligenceRunFailed(
      running.id,
      running.companyId,
      JOB_INTELLIGENCE_INTERNAL_ERROR,
    );
  }

  const run = await createJobIntelligenceRun(key);
  try {
    const drafts = extractJobRequirements(extractionInput);
    const withConcepts = await Promise.all(
      drafts.map(async (draft) => ({
        ...draft,
        skillConceptId: draft.skillCanonicalKey
          ? await findSkillConceptId(ONTOLOGY_VERSION, draft.skillCanonicalKey)
          : null,
      })),
    );

    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedJobIntelligenceRun(key, tx);
      if (raced) {
        await markJobIntelligenceRunFailed(
          run.id,
          key.companyId,
          JOB_INTELLIGENCE_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createJobRequirements(
        {
          companyId: key.companyId,
          runId: run.id,
          jobId: key.jobId,
          jobSpecificationVersionId: key.jobSpecificationVersionId,
          rows: withConcepts,
        },
        tx,
      );
      const updated = await markJobIntelligenceRunCompleted(
        run.id,
        key.companyId,
        tx,
      );
      if (updated.count !== 1) {
        throw new JobIntelligenceError(
          JOB_INTELLIGENCE_GENERIC_ERROR,
          JOB_INTELLIGENCE_INTERNAL_ERROR,
        );
      }
      const stored = await getJobIntelligenceRunWithRows(run.id, key.companyId, tx);
      if (!stored) {
        throw new JobIntelligenceError(
          JOB_INTELLIGENCE_GENERIC_ERROR,
          JOB_INTELLIGENCE_INTERNAL_ERROR,
        );
      }
      return stored;
    });
    return toSafeRun(completed);
  } catch (error) {
    await markJobIntelligenceRunFailed(
      run.id,
      key.companyId,
      error instanceof JobIntelligenceError
        ? error.code
        : JOB_INTELLIGENCE_INTERNAL_ERROR,
    );
    if (error instanceof JobIntelligenceError) {
      throw error;
    }
    throw new JobIntelligenceError(
      JOB_INTELLIGENCE_GENERIC_ERROR,
      JOB_INTELLIGENCE_INTERNAL_ERROR,
    );
  }
}

export async function getJobIntelligence(
  jobIdInput: unknown,
): Promise<JobIntelligencePageData> {
  await requireJobIntelligenceAdmin();
  const jobId = validateJobIntelligenceJobId(jobIdInput);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    notFound();
  }
  const [specs, runs] = await Promise.all([
    listPublishedSpecsForJob(job.id, job.companyId),
    listJobIntelligenceRunsForJob(job.id, job.companyId),
  ]);
  return {
    jobId: job.id,
    publishedSpecs: specs,
    runs: runs.map(toSafeRun),
  };
}

export async function runJobIntelligenceForAdmin(
  jobIdInput: unknown,
  specificationIdInput: unknown,
  browserInput?: unknown,
) {
  await requireJobIntelligenceAdmin();
  rejectForbiddenJobIntelligenceFields(browserInput);
  return executeRunJobIntelligence({
    jobId: validateJobIntelligenceJobId(jobIdInput),
    jobSpecificationVersionId:
      validateJobIntelligenceSpecificationId(specificationIdInput),
  });
}

export function isJobIntelligenceActionError(
  error: unknown,
): error is
  | JobIntelligenceError
  | JobIntelligenceValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof JobIntelligenceError ||
    error instanceof JobIntelligenceValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function jobIntelligenceActionErrorMessage(error: unknown) {
  if (error instanceof JobIntelligenceValidationError) {
    return error.message;
  }
  if (error instanceof JobIntelligenceError) {
    if (
      error.code === JOB_INTELLIGENCE_SPEC_NOT_PUBLISHED ||
      error.code === JOB_INTELLIGENCE_SPEC_JOB_MISMATCH ||
      error.code === JOB_INTELLIGENCE_IN_PROGRESS
    ) {
      return error.message;
    }
    if (
      error.code === JOB_INTELLIGENCE_NOT_FOUND ||
      error.code === JOB_INTELLIGENCE_SPEC_NOT_FOUND
    ) {
      return "Resource not found.";
    }
    return JOB_INTELLIGENCE_GENERIC_ERROR;
  }
  return "Resource not found.";
}
