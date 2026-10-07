import { PortalRole } from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  createHybridRetrievalResults,
  createHybridRetrievalRun,
  findCompletedHybridRetrievalRun,
  findLatestRunningHybridRetrievalRun,
  getHybridRetrievalRunWithRows,
  getLexicalBaselineForHybrid,
  getSemanticBaselineForHybrid,
  listCompletedBaselineChoices,
  listHybridRetrievalRunsForJob,
  markHybridRetrievalRunCompleted,
  markHybridRetrievalRunFailed,
  type HybridRetrievalIdempotencyKey,
  type HybridRetrievalRunRow,
} from "@/lib/repositories/hybrid-retrieval-repository";
import { assertCompatibleHybridBaselines } from "@/lib/retrieval/hybrid-baseline";
import {
  explainHybridRetrieval,
  fuseReciprocalRank,
  resolveHybridRunDisposition,
} from "@/lib/retrieval/hybrid-engine";
import {
  HYBRID_RETRIEVAL_GENERIC_ERROR,
  HYBRID_RETRIEVAL_IN_PROGRESS,
  HYBRID_RETRIEVAL_INTERNAL_ERROR,
  HYBRID_RETRIEVAL_NOT_FOUND,
  HybridRetrievalError,
} from "@/lib/retrieval/hybrid-retrieval-errors";
import type {
  HybridRetrievalPageData,
  SafeHybridRetrievalRun,
} from "@/lib/retrieval/hybrid-retrieval-types";
import {
  HYBRID_DATASET_VERSION,
  HYBRID_FUSION_VERSION,
  HYBRID_RRF_K,
  STALE_HYBRID_RETRIEVAL_RUNNING_MS,
} from "@/lib/retrieval/hybrid-retrieval-versions";
import {
  HybridRetrievalValidationError,
  isAdminHybridRetrievalRole,
  rejectForbiddenHybridRetrievalFields,
  validateHybridRetrievalJobId,
  validateHybridRetrievalLimit,
  validateHybridRetrievalRunId,
} from "@/lib/validation/hybrid-retrieval-validation";

async function requireHybridRetrievalAdmin() {
  const admin = await requireAdmin();
  if (!isAdminHybridRetrievalRole(admin.role ?? PortalRole.CLIENT)) {
    throw new AuthorizationError("Resource not found.");
  }
  return admin;
}

function toSafeRun(row: HybridRetrievalRunRow): SafeHybridRetrievalRun {
  return {
    ...row,
    results: row.results.map((result) => ({
      ...result,
      whyRetrieved: explainHybridRetrieval({
        applicationId: result.applicationId,
        candidateId: result.candidateId,
        companyId: result.companyId,
        lexicalRank: result.lexicalRank,
        semanticRank: result.semanticRank,
        rrfScore: result.rrfScore,
        fusionVersion: result.fusionVersion,
      }),
    })),
  };
}

export async function executeHybridRetrieval(input: {
  jobId: number;
  lexicalRunId: number;
  semanticRunId: number;
  limit: number;
}) {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    throw new HybridRetrievalError("Job was not found.", HYBRID_RETRIEVAL_NOT_FOUND);
  }

  const [lexical, semantic] = await Promise.all([
    getLexicalBaselineForHybrid(input.lexicalRunId, job.companyId),
    getSemanticBaselineForHybrid(input.semanticRunId, job.companyId),
  ]);
  if (!lexical || !semantic) {
    throw new HybridRetrievalError(
      "Baseline run was not found for this company.",
      HYBRID_RETRIEVAL_NOT_FOUND,
    );
  }

  assertCompatibleHybridBaselines({
    companyId: job.companyId,
    jobId: job.id,
    lexical,
    semantic,
    limit: input.limit,
  });

  const fused = fuseReciprocalRank({
    companyId: job.companyId,
    lexical: lexical.results,
    semantic: semantic.results,
    limit: input.limit,
  });

  const key: HybridRetrievalIdempotencyKey = {
    companyId: job.companyId,
    lexicalRunId: lexical.id,
    semanticRunId: semantic.id,
    fusionVersion: HYBRID_FUSION_VERSION,
    rrfK: HYBRID_RRF_K,
    resultLimit: input.limit,
    datasetVersion: HYBRID_DATASET_VERSION,
  };

  const disposition = resolveHybridRunDisposition({
    completedExists: Boolean(await findCompletedHybridRetrievalRun(key)),
    runningAgeMs: null,
    staleMs: STALE_HYBRID_RETRIEVAL_RUNNING_MS,
  });
  if (disposition === "reuse") {
    const existing = await findCompletedHybridRetrievalRun(key);
    if (!existing) {
      throw new HybridRetrievalError(
        HYBRID_RETRIEVAL_GENERIC_ERROR,
        HYBRID_RETRIEVAL_INTERNAL_ERROR,
      );
    }
    return toSafeRun(existing);
  }

  const running = await findLatestRunningHybridRetrievalRun(key);
  const runningDisposition = resolveHybridRunDisposition({
    completedExists: false,
    runningAgeMs: running ? Date.now() - running.createdAt.getTime() : null,
    staleMs: STALE_HYBRID_RETRIEVAL_RUNNING_MS,
  });
  if (runningDisposition === "refuse" && running) {
    throw new HybridRetrievalError(
      "Hybrid retrieval is already running.",
      HYBRID_RETRIEVAL_IN_PROGRESS,
    );
  }
  if (runningDisposition === "recover" && running) {
    await markHybridRetrievalRunFailed(
      running.id,
      running.companyId,
      HYBRID_RETRIEVAL_INTERNAL_ERROR,
    );
  }

  const run = await createHybridRetrievalRun({
    ...key,
    jobId: job.id,
    jobSpecificationVersionId: lexical.jobSpecificationVersionId,
    lexicalRetrievalVersion: lexical.retrievalVersion,
    semanticRetrievalVersion: semantic.retrievalVersion,
  });

  try {
    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedHybridRetrievalRun(key, tx);
      if (raced) {
        await markHybridRetrievalRunFailed(
          run.id,
          key.companyId,
          HYBRID_RETRIEVAL_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createHybridRetrievalResults(
        { companyId: key.companyId, runId: run.id, rows: fused },
        tx,
      );
      const updated = await markHybridRetrievalRunCompleted(
        run.id,
        key.companyId,
        fused.length,
        tx,
      );
      if (updated.count !== 1) {
        throw new HybridRetrievalError(
          HYBRID_RETRIEVAL_GENERIC_ERROR,
          HYBRID_RETRIEVAL_INTERNAL_ERROR,
        );
      }
      const stored = await getHybridRetrievalRunWithRows(run.id, key.companyId, tx);
      if (!stored) {
        throw new HybridRetrievalError(
          HYBRID_RETRIEVAL_GENERIC_ERROR,
          HYBRID_RETRIEVAL_INTERNAL_ERROR,
        );
      }
      return stored;
    });
    return toSafeRun(completed);
  } catch (error) {
    await markHybridRetrievalRunFailed(
      run.id,
      key.companyId,
      error instanceof HybridRetrievalError
        ? error.code
        : HYBRID_RETRIEVAL_INTERNAL_ERROR,
    );
    if (error instanceof HybridRetrievalError) {
      throw error;
    }
    throw new HybridRetrievalError(
      HYBRID_RETRIEVAL_GENERIC_ERROR,
      HYBRID_RETRIEVAL_INTERNAL_ERROR,
    );
  }
}

export async function runHybridRetrievalForAdmin(
  jobIdInput: unknown,
  lexicalRunIdInput: unknown,
  semanticRunIdInput: unknown,
  limitInput?: unknown,
) {
  await requireHybridRetrievalAdmin();
  rejectForbiddenHybridRetrievalFields({
    jobId: jobIdInput,
    lexicalRunId: lexicalRunIdInput,
    semanticRunId: semanticRunIdInput,
    limit: limitInput,
  });
  return executeHybridRetrieval({
    jobId: validateHybridRetrievalJobId(jobIdInput),
    lexicalRunId: validateHybridRetrievalRunId(lexicalRunIdInput, "Lexical run"),
    semanticRunId: validateHybridRetrievalRunId(semanticRunIdInput, "Semantic run"),
    limit: validateHybridRetrievalLimit(limitInput),
  });
}

export async function getHybridRetrieval(jobIdInput: unknown): Promise<HybridRetrievalPageData> {
  await requireHybridRetrievalAdmin();
  const jobId = validateHybridRetrievalJobId(jobIdInput);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    throw new HybridRetrievalError("Job was not found.", HYBRID_RETRIEVAL_NOT_FOUND);
  }
  const [choices, runs] = await Promise.all([
    listCompletedBaselineChoices(job.id, job.companyId),
    listHybridRetrievalRunsForJob(job.id, job.companyId),
  ]);
  return {
    jobId: job.id,
    lexicalRuns: choices.lexicalRuns,
    semanticRuns: choices.semanticRuns,
    runs: runs.map(toSafeRun),
  };
}

export function isHybridRetrievalActionError(error: unknown) {
  return (
    error instanceof HybridRetrievalError ||
    error instanceof HybridRetrievalValidationError ||
    error instanceof AuthorizationError
  );
}

export function hybridRetrievalActionErrorMessage(error: unknown) {
  if (error instanceof AuthenticationError) {
    return error.message;
  }
  if (error instanceof HybridRetrievalError || error instanceof AuthorizationError) {
    return error.message;
  }
  return HYBRID_RETRIEVAL_GENERIC_ERROR;
}
