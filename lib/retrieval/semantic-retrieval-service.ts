import {
  JobSpecificationVersionStatus,
  PortalRole,
  RetrievalEmbeddingSourceType,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import { executeRunJobIntelligence } from "@/lib/jobs/intelligence/job-intelligence-service";
import { optedOutApplicationIds, optedOutCandidateIds } from "@/lib/ai/opt-out";
import { ONTOLOGY_VERSION } from "@/lib/ontology/skill-alias-catalog";
import { prisma } from "@/lib/prisma";
import {
  getPublishedSpecForJobIntelligence,
  listPublishedSpecsForJob,
} from "@/lib/repositories/job-intelligence-repository";
import {
  listApplicationsForLexicalRetrieval,
  listEligibleEvidenceForLexicalRetrieval,
} from "@/lib/repositories/lexical-retrieval-repository";
import {
  createSemanticRetrievalResults,
  createSemanticRetrievalRun,
  findCompletedSemanticRetrievalRun,
  findLatestRunningSemanticRetrievalRun,
  getSemanticRetrievalRunWithRows,
  listSemanticRetrievalRunsForJob,
  markSemanticRetrievalRunCompleted,
  markSemanticRetrievalRunFailed,
  type SemanticRetrievalIdempotencyKey,
  type SemanticRetrievalRunRow,
} from "@/lib/repositories/semantic-retrieval-repository";
import {
  assembleLexicalCorpus,
  hashEvidenceSnapshot,
} from "@/lib/retrieval/lexical-engine";
import { buildLexicalQuery, hashLexicalQuery } from "@/lib/retrieval/lexical-query";
import type { LexicalApplicationDocument, LexicalEvidenceDocument } from "@/lib/retrieval/lexical-retrieval-types";
import {
  embeddingCacheKey,
  loadOrCreateRetrievalEmbeddings,
} from "@/lib/retrieval/semantic-embedding-store";
import {
  embedRetrievalTexts,
  isSemanticEmbeddingConfigured,
} from "@/lib/retrieval/semantic-embedder";
import {
  collectEligibleEvidence,
  explainSemanticRetrieval,
  rankSemanticApplications,
} from "@/lib/retrieval/semantic-engine";
import {
  buildSemanticJobQueryText,
  hashEmbeddingContent,
  redactRetrievalText,
} from "@/lib/retrieval/semantic-representation";
import {
  SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
  SEMANTIC_RETRIEVAL_GENERIC_ERROR,
  SEMANTIC_RETRIEVAL_IN_PROGRESS,
  SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
  SEMANTIC_RETRIEVAL_NOT_FOUND,
  SEMANTIC_RETRIEVAL_SPEC_JOB_MISMATCH,
  SEMANTIC_RETRIEVAL_SPEC_NOT_PUBLISHED,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";
import type {
  SemanticRetrievalPageData,
  SafeSemanticRetrievalResult,
  SafeSemanticRetrievalRun,
} from "@/lib/retrieval/semantic-retrieval-types";
import {
  SEMANTIC_NORMALIZATION_VERSION,
  SEMANTIC_QUERY_CONSTRUCTION_VERSION,
  SEMANTIC_REPRESENTATION_VERSION,
  SEMANTIC_RETRIEVAL_METHOD,
  SEMANTIC_RETRIEVAL_VERSION,
  STALE_SEMANTIC_RETRIEVAL_RUNNING_MS,
} from "@/lib/retrieval/semantic-retrieval-versions";
import {
  SemanticRetrievalValidationError,
  isAdminSemanticRetrievalRole,
  rejectForbiddenSemanticRetrievalFields,
  validateSemanticRetrievalJobId,
  validateSemanticRetrievalLimit,
  validateSemanticRetrievalSpecificationId,
} from "@/lib/validation/semantic-retrieval-validation";

async function evidenceEligibleForEmbedding(companyId: number, rows: LexicalEvidenceDocument[]) {
  const blocked = await optedOutCandidateIds(companyId, rows.map((row) => row.candidateId));
  return rows.filter((row) => !blocked.has(row.candidateId));
}

function notFound(): never {
  throw new SemanticRetrievalError(
    "Resource not found.",
    SEMANTIC_RETRIEVAL_NOT_FOUND,
  );
}

export function assertCanManageSemanticRetrieval(role: PortalRole) {
  if (!isAdminSemanticRetrievalRole(role)) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireSemanticRetrievalAdmin() {
  const user = await requireAdmin();
  assertCanManageSemanticRetrieval(user.role);
  return user;
}

function toSafeResult(
  row: SemanticRetrievalRunRow["results"][number],
): SafeSemanticRetrievalResult {
  return {
    ...row,
    whyRetrieved: explainSemanticRetrieval({
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      companyId: row.companyId,
      semanticScore: row.semanticScore,
      supportingEvidenceId: row.supportingEvidenceId,
    }),
  };
}

function toSafeRun(row: SemanticRetrievalRunRow): SafeSemanticRetrievalRun {
  return {
    id: row.id,
    companyId: row.companyId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    jobIntelligenceRunId: row.jobIntelligenceRunId,
    status: row.status,
    retrievalVersion: row.retrievalVersion,
    queryConstructionVersion: row.queryConstructionVersion,
    representationVersion: row.representationVersion,
    normalizationVersion: row.normalizationVersion,
    ontologyVersion: row.ontologyVersion,
    embeddingProvider: row.embeddingProvider,
    embeddingModel: row.embeddingModel,
    embeddingModelVersion: row.embeddingModelVersion,
    embeddingDimensions: row.embeddingDimensions,
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

export async function executeRunSemanticRetrieval(input: {
  jobId: number;
  jobSpecificationVersionId: number;
  limit: number;
}): Promise<SafeSemanticRetrievalRun> {
  if (!isSemanticEmbeddingConfigured()) {
    throw new SemanticRetrievalError(
      "Semantic embeddings are not configured.",
      SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
    );
  }

  const spec = await getPublishedSpecForJobIntelligence(
    input.jobSpecificationVersionId,
  );
  if (!spec) {
    notFound();
  }
  if (spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new SemanticRetrievalError(
      "A published specification is required.",
      SEMANTIC_RETRIEVAL_SPEC_NOT_PUBLISHED,
    );
  }
  if (spec.jobId !== input.jobId || spec.job.id !== input.jobId) {
    throw new SemanticRetrievalError(
      "Specification does not belong to this job.",
      SEMANTIC_RETRIEVAL_SPEC_JOB_MISMATCH,
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

  const allApplications = await listApplicationsForLexicalRetrieval(
    input.jobId,
    companyId,
  );
  if (allApplications.some((row) => row.companyId !== companyId || row.jobId !== input.jobId)) {
    notFound();
  }
  // Blocked = refused, unknown, or human review requested. Only explicitly ALLOWED applications are embedded or ranked.
  const optedOut = await optedOutApplicationIds(companyId, allApplications.map((row) => row.id));
  const applications = allApplications.filter((row) => !optedOut.has(row.id));

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
      skillCanonicalKey: requirement.skillConceptId
        ? requirement.normalizedValue
        : null,
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

  const identityProbe = await embedRetrievalTexts([]);
  const identity = {
    companyId,
    modelProvider: identityProbe.provider,
    modelName: identityProbe.model,
    modelVersion: identityProbe.modelVersion,
    dimensions: identityProbe.dimensions,
    normalizationVersion: SEMANTIC_NORMALIZATION_VERSION,
  };

  const queryText = redactRetrievalText(buildSemanticJobQueryText(query));
  const queryHash = hashLexicalQuery(query);
  const eligibleEvidence = await evidenceEligibleForEmbedding(companyId, collectEligibleEvidence(documents));
  const embeddingRequests = [
    ...(queryText
      ? [
          {
            sourceType: RetrievalEmbeddingSourceType.JOB_QUERY,
            sourceId: intel.id,
            contentHash: hashEmbeddingContent(queryText),
            text: queryText,
          },
        ]
      : []),
    ...eligibleEvidence
      .map((evidence) => {
        const text = redactRetrievalText(evidence.inlineText ?? "");
        if (!text) {
          return null;
        }
        return {
          sourceType: RetrievalEmbeddingSourceType.EVIDENCE,
          sourceId: evidence.evidenceId,
          contentHash: hashEmbeddingContent(text),
          text,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null),
  ];

  const vectors = await loadOrCreateRetrievalEmbeddings({
    identity,
    requests: embeddingRequests,
  });

  const queryVector = queryText
    ? vectors.get(
        embeddingCacheKey(
          RetrievalEmbeddingSourceType.JOB_QUERY,
          intel.id,
          hashEmbeddingContent(queryText),
        ),
      )
    : undefined;

  const evidenceVectors = new Map<number, number[]>();
  for (const evidence of eligibleEvidence) {
    const text = redactRetrievalText(evidence.inlineText ?? "");
    if (!text) {
      continue;
    }
    const vector = vectors.get(
      embeddingCacheKey(
        RetrievalEmbeddingSourceType.EVIDENCE,
        evidence.evidenceId,
        hashEmbeddingContent(text),
      ),
    );
    if (vector) {
      evidenceVectors.set(evidence.evidenceId, vector);
    }
  }

  const ranked =
    queryVector && queryVector.length > 0
      ? rankSemanticApplications({
          queryVector,
          applications: documents,
          evidenceVectors,
          limit: input.limit,
        })
      : [];

  const key: SemanticRetrievalIdempotencyKey = {
    companyId,
    jobId: input.jobId,
    jobSpecificationVersionId: spec.id,
    jobIntelligenceRunId: intel.id,
    retrievalVersion: SEMANTIC_RETRIEVAL_VERSION,
    queryConstructionVersion: SEMANTIC_QUERY_CONSTRUCTION_VERSION,
    representationVersion: SEMANTIC_REPRESENTATION_VERSION,
    normalizationVersion: SEMANTIC_NORMALIZATION_VERSION,
    ontologyVersion: ONTOLOGY_VERSION,
    embeddingProvider: identity.modelProvider,
    embeddingModel: identity.modelName,
    embeddingModelVersion: identity.modelVersion,
    embeddingDimensions: identity.dimensions,
    resultLimit: input.limit,
    queryHash,
    evidenceSnapshotHash: hashEvidenceSnapshot(
      evidenceRows.map((row) => ({
        evidenceId: row.id,
        contentSha256: row.contentSha256,
      })),
    ),
  };

  const existing = await findCompletedSemanticRetrievalRun(key);
  if (existing) {
    return toSafeRun(existing);
  }

  const running = await findLatestRunningSemanticRetrievalRun(key);
  if (running) {
    if (Date.now() - running.createdAt.getTime() < STALE_SEMANTIC_RETRIEVAL_RUNNING_MS) {
      throw new SemanticRetrievalError(
        "Semantic retrieval is already running.",
        SEMANTIC_RETRIEVAL_IN_PROGRESS,
      );
    }
    await markSemanticRetrievalRunFailed(
      running.id,
      running.companyId,
      SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
    );
  }

  const run = await createSemanticRetrievalRun(key);
  try {
    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedSemanticRetrievalRun(key, tx);
      if (raced) {
        await markSemanticRetrievalRunFailed(
          run.id,
          key.companyId,
          SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createSemanticRetrievalResults(
        {
          companyId: key.companyId,
          runId: run.id,
          method: SEMANTIC_RETRIEVAL_METHOD,
          rows: ranked,
        },
        tx,
      );
      const updated = await markSemanticRetrievalRunCompleted(
        run.id,
        key.companyId,
        {
          searchedCount: applications.length,
          retrievedCount: ranked.length,
        },
        tx,
      );
      if (updated.count !== 1) {
        throw new SemanticRetrievalError(
          SEMANTIC_RETRIEVAL_GENERIC_ERROR,
          SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
        );
      }
      const stored = await getSemanticRetrievalRunWithRows(
        run.id,
        key.companyId,
        tx,
      );
      if (!stored) {
        throw new SemanticRetrievalError(
          SEMANTIC_RETRIEVAL_GENERIC_ERROR,
          SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
        );
      }
      return stored;
    });
    return toSafeRun(completed);
  } catch (error) {
    await markSemanticRetrievalRunFailed(
      run.id,
      key.companyId,
      error instanceof SemanticRetrievalError
        ? error.code
        : SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
    );
    if (error instanceof SemanticRetrievalError) {
      throw error;
    }
    throw new SemanticRetrievalError(
      SEMANTIC_RETRIEVAL_GENERIC_ERROR,
      SEMANTIC_RETRIEVAL_INTERNAL_ERROR,
    );
  }
}

export async function getSemanticRetrieval(
  jobIdInput: unknown,
): Promise<SemanticRetrievalPageData> {
  await requireSemanticRetrievalAdmin();
  const jobId = validateSemanticRetrievalJobId(jobIdInput);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    notFound();
  }
  const [specs, runs] = await Promise.all([
    listPublishedSpecsForJob(job.id, job.companyId),
    listSemanticRetrievalRunsForJob(job.id, job.companyId),
  ]);
  return {
    jobId: job.id,
    publishedSpecs: specs,
    runs: runs.map(toSafeRun),
  };
}

export async function runSemanticRetrievalForAdmin(
  jobIdInput: unknown,
  specificationIdInput: unknown,
  limitInput?: unknown,
  browserInput?: unknown,
) {
  await requireSemanticRetrievalAdmin();
  rejectForbiddenSemanticRetrievalFields(browserInput);
  return executeRunSemanticRetrieval({
    jobId: validateSemanticRetrievalJobId(jobIdInput),
    jobSpecificationVersionId:
      validateSemanticRetrievalSpecificationId(specificationIdInput),
    limit: validateSemanticRetrievalLimit(limitInput),
  });
}

export function isSemanticRetrievalActionError(
  error: unknown,
): error is
  | SemanticRetrievalError
  | SemanticRetrievalValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof SemanticRetrievalError ||
    error instanceof SemanticRetrievalValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function semanticRetrievalActionErrorMessage(error: unknown) {
  if (error instanceof SemanticRetrievalValidationError) {
    return error.message;
  }
  if (error instanceof SemanticRetrievalError) {
    if (
      error.code === SEMANTIC_RETRIEVAL_SPEC_NOT_PUBLISHED ||
      error.code === SEMANTIC_RETRIEVAL_SPEC_JOB_MISMATCH ||
      error.code === SEMANTIC_RETRIEVAL_IN_PROGRESS ||
      error.code === SEMANTIC_EMBEDDINGS_NOT_CONFIGURED
    ) {
      return error.message;
    }
    if (error.code === SEMANTIC_RETRIEVAL_NOT_FOUND) {
      return "Resource not found.";
    }
    return SEMANTIC_RETRIEVAL_GENERIC_ERROR;
  }
  return "Resource not found.";
}
