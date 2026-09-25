import {
  JobSpecificationVersionStatus,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import { executeRunJobIntelligence } from "@/lib/jobs/intelligence/job-intelligence-service";
import { ONTOLOGY_VERSION } from "@/lib/ontology/skill-alias-catalog";
import { prisma } from "@/lib/prisma";
import {
  getPublishedSpecForJobIntelligence,
  listPublishedSpecsForJob,
} from "@/lib/repositories/job-intelligence-repository";
import {
  createLexicalRetrievalResults,
  createLexicalRetrievalRun,
  findCompletedLexicalRetrievalRun,
  findLatestRunningLexicalRetrievalRun,
  getLexicalRetrievalRunWithRows,
  listApplicationsForLexicalRetrieval,
  listEligibleEvidenceForLexicalRetrieval,
  listLexicalRetrievalRunsForJob,
  markLexicalRetrievalRunCompleted,
  markLexicalRetrievalRunFailed,
  type LexicalRetrievalIdempotencyKey,
  type LexicalRetrievalRunRow,
} from "@/lib/repositories/lexical-retrieval-repository";
import {
  assembleLexicalCorpus,
  explainLexicalRetrieval,
  hashEvidenceSnapshot,
  rankLexicalApplications,
} from "@/lib/retrieval/lexical-engine";
import { buildLexicalQuery, hashLexicalQuery } from "@/lib/retrieval/lexical-query";
import {
  LEXICAL_RETRIEVAL_GENERIC_ERROR,
  LEXICAL_RETRIEVAL_IN_PROGRESS,
  LEXICAL_RETRIEVAL_INTERNAL_ERROR,
  LEXICAL_RETRIEVAL_NOT_FOUND,
  LEXICAL_RETRIEVAL_SPEC_JOB_MISMATCH,
  LEXICAL_RETRIEVAL_SPEC_NOT_PUBLISHED,
  LexicalRetrievalError,
} from "@/lib/retrieval/lexical-retrieval-errors";
import type {
  LexicalApplicationDocument,
  LexicalRetrievalPageData,
  SafeLexicalRetrievalResult,
  SafeLexicalRetrievalRun,
} from "@/lib/retrieval/lexical-retrieval-types";
import {
  LEXICAL_NORMALIZATION_VERSION,
  LEXICAL_QUERY_CONSTRUCTION_VERSION,
  LEXICAL_RETRIEVAL_METHOD,
  LEXICAL_RETRIEVAL_VERSION,
  STALE_LEXICAL_RETRIEVAL_RUNNING_MS,
} from "@/lib/retrieval/lexical-retrieval-versions";
import {
  LexicalRetrievalValidationError,
  rejectForbiddenLexicalRetrievalFields,
  validateLexicalRetrievalJobId,
  validateLexicalRetrievalLimit,
  validateLexicalRetrievalSpecificationId,
} from "@/lib/validation/lexical-retrieval-validation";

function notFound(): never {
  throw new LexicalRetrievalError("Resource not found.", LEXICAL_RETRIEVAL_NOT_FOUND);
}

export function assertCanManageLexicalRetrieval(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireLexicalRetrievalAdmin() {
  const user = await requireAdmin();
  assertCanManageLexicalRetrieval(user.role);
  return user;
}

function toSafeResult(row: LexicalRetrievalRunRow["results"][number]): SafeLexicalRetrievalResult {
  return {
    ...row,
    whyRetrieved: explainLexicalRetrieval({
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      companyId: row.companyId,
      lexicalScore: row.lexicalScore,
      matchedTerms: row.matchedTerms,
    }),
  };
}

function toSafeRun(row: LexicalRetrievalRunRow): SafeLexicalRetrievalRun {
  return {
    id: row.id,
    companyId: row.companyId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    jobIntelligenceRunId: row.jobIntelligenceRunId,
    status: row.status,
    retrievalVersion: row.retrievalVersion,
    queryConstructionVersion: row.queryConstructionVersion,
    normalizationVersion: row.normalizationVersion,
    ontologyVersion: row.ontologyVersion,
    resultLimit: row.resultLimit,
    searchedCount: row.searchedCount,
    retrievedCount: row.retrievedCount,
    queryHash: row.queryHash,
    evidenceSnapshotHash: row.evidenceSnapshotHash,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    results: row.results.map(toSafeResult),
  };
}

export async function executeRunLexicalRetrieval(input: {
  jobId: number;
  jobSpecificationVersionId: number;
  limit: number;
}): Promise<SafeLexicalRetrievalRun> {
  const spec = await getPublishedSpecForJobIntelligence(input.jobSpecificationVersionId);
  if (!spec) {
    notFound();
  }
  if (spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new LexicalRetrievalError(
      "A published specification is required.",
      LEXICAL_RETRIEVAL_SPEC_NOT_PUBLISHED,
    );
  }
  if (spec.jobId !== input.jobId || spec.job.id !== input.jobId) {
    throw new LexicalRetrievalError(
      "Specification does not belong to this job.",
      LEXICAL_RETRIEVAL_SPEC_JOB_MISMATCH,
    );
  }

  const companyId = spec.job.companyId;
  const intel = await executeRunJobIntelligence({
    jobId: input.jobId,
    jobSpecificationVersionId: spec.id,
  });
  if (intel.companyId !== companyId) {
    notFound();
  }

  const applications = await listApplicationsForLexicalRetrieval(input.jobId, companyId);
  if (applications.some((row) => row.companyId !== companyId || row.jobId !== input.jobId)) {
    notFound();
  }

  const evidenceRows = await listEligibleEvidenceForLexicalRetrieval({
    companyId,
    candidateIds: applications.map((row) => row.candidateId),
    applicationIds: applications.map((row) => row.id),
  });
  if (evidenceRows.some((row) => row.companyId !== companyId)) {
    notFound();
  }

  const query = buildLexicalQuery(
    intel.requirements.map((requirement) => ({
      sourceField: requirement.sourceField,
      sourceText: requirement.sourceText,
      category: requirement.category,
      normalizedValue: requirement.normalizedValue,
      skillCanonicalKey: requirement.skillConceptId ? requirement.normalizedValue : null,
    })),
  );

  const documents: LexicalApplicationDocument[] = assembleLexicalCorpus({
    companyId,
    jobId: input.jobId,
    applications,
    evidence: evidenceRows.map((evidence) => ({
      evidenceId: evidence.id,
      applicationId: evidence.applicationId,
      candidateId: evidence.candidateId,
      companyId: evidence.companyId,
      inlineText: evidence.inlineText,
      contentSha256: evidence.contentSha256,
      revokedAt: evidence.revokedAt,
      supersededById: evidence.supersededById,
    })),
  });

  const ranked = rankLexicalApplications({
    query,
    applications: documents,
    limit: input.limit,
  });

  const key: LexicalRetrievalIdempotencyKey = {
    companyId,
    jobId: input.jobId,
    jobSpecificationVersionId: spec.id,
    jobIntelligenceRunId: intel.id,
    retrievalVersion: LEXICAL_RETRIEVAL_VERSION,
    queryConstructionVersion: LEXICAL_QUERY_CONSTRUCTION_VERSION,
    normalizationVersion: LEXICAL_NORMALIZATION_VERSION,
    ontologyVersion: ONTOLOGY_VERSION,
    resultLimit: input.limit,
    queryHash: hashLexicalQuery(query),
    evidenceSnapshotHash: hashEvidenceSnapshot(
      evidenceRows.map((row) => ({
        evidenceId: row.id,
        contentSha256: row.contentSha256,
      })),
    ),
  };

  const existing = await findCompletedLexicalRetrievalRun(key);
  if (existing) {
    return toSafeRun(existing);
  }

  const running = await findLatestRunningLexicalRetrievalRun(key);
  if (running) {
    if (Date.now() - running.createdAt.getTime() < STALE_LEXICAL_RETRIEVAL_RUNNING_MS) {
      throw new LexicalRetrievalError(
        "Lexical retrieval is already running.",
        LEXICAL_RETRIEVAL_IN_PROGRESS,
      );
    }
    await markLexicalRetrievalRunFailed(
      running.id,
      running.companyId,
      LEXICAL_RETRIEVAL_INTERNAL_ERROR,
    );
  }

  const run = await createLexicalRetrievalRun(key);
  try {
    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedLexicalRetrievalRun(key, tx);
      if (raced) {
        await markLexicalRetrievalRunFailed(
          run.id,
          key.companyId,
          LEXICAL_RETRIEVAL_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createLexicalRetrievalResults(
        {
          companyId: key.companyId,
          runId: run.id,
          method: LEXICAL_RETRIEVAL_METHOD,
          rows: ranked,
        },
        tx,
      );
      const updated = await markLexicalRetrievalRunCompleted(
        run.id,
        key.companyId,
        {
          searchedCount: applications.length,
          retrievedCount: ranked.length,
        },
        tx,
      );
      if (updated.count !== 1) {
        throw new LexicalRetrievalError(
          LEXICAL_RETRIEVAL_GENERIC_ERROR,
          LEXICAL_RETRIEVAL_INTERNAL_ERROR,
        );
      }
      const stored = await getLexicalRetrievalRunWithRows(run.id, key.companyId, tx);
      if (!stored) {
        throw new LexicalRetrievalError(
          LEXICAL_RETRIEVAL_GENERIC_ERROR,
          LEXICAL_RETRIEVAL_INTERNAL_ERROR,
        );
      }
      return stored;
    });
    return toSafeRun(completed);
  } catch (error) {
    await markLexicalRetrievalRunFailed(
      run.id,
      key.companyId,
      error instanceof LexicalRetrievalError
        ? error.code
        : LEXICAL_RETRIEVAL_INTERNAL_ERROR,
    );
    if (error instanceof LexicalRetrievalError) {
      throw error;
    }
    throw new LexicalRetrievalError(
      LEXICAL_RETRIEVAL_GENERIC_ERROR,
      LEXICAL_RETRIEVAL_INTERNAL_ERROR,
    );
  }
}

export async function getLexicalRetrieval(
  jobIdInput: unknown,
): Promise<LexicalRetrievalPageData> {
  await requireLexicalRetrievalAdmin();
  const jobId = validateLexicalRetrievalJobId(jobIdInput);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    notFound();
  }
  const [specs, runs] = await Promise.all([
    listPublishedSpecsForJob(job.id, job.companyId),
    listLexicalRetrievalRunsForJob(job.id, job.companyId),
  ]);
  return {
    jobId: job.id,
    publishedSpecs: specs,
    runs: runs.map(toSafeRun),
  };
}

export async function runLexicalRetrievalForAdmin(
  jobIdInput: unknown,
  specificationIdInput: unknown,
  limitInput?: unknown,
  browserInput?: unknown,
) {
  await requireLexicalRetrievalAdmin();
  rejectForbiddenLexicalRetrievalFields(browserInput);
  return executeRunLexicalRetrieval({
    jobId: validateLexicalRetrievalJobId(jobIdInput),
    jobSpecificationVersionId:
      validateLexicalRetrievalSpecificationId(specificationIdInput),
    limit: validateLexicalRetrievalLimit(limitInput),
  });
}

export function isLexicalRetrievalActionError(
  error: unknown,
): error is
  | LexicalRetrievalError
  | LexicalRetrievalValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof LexicalRetrievalError ||
    error instanceof LexicalRetrievalValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function lexicalRetrievalActionErrorMessage(error: unknown) {
  if (error instanceof LexicalRetrievalValidationError) {
    return error.message;
  }
  if (error instanceof LexicalRetrievalError) {
    if (
      error.code === LEXICAL_RETRIEVAL_SPEC_NOT_PUBLISHED ||
      error.code === LEXICAL_RETRIEVAL_SPEC_JOB_MISMATCH ||
      error.code === LEXICAL_RETRIEVAL_IN_PROGRESS
    ) {
      return error.message;
    }
    if (error.code === LEXICAL_RETRIEVAL_NOT_FOUND) {
      return "Resource not found.";
    }
    return LEXICAL_RETRIEVAL_GENERIC_ERROR;
  }
  return "Resource not found.";
}
