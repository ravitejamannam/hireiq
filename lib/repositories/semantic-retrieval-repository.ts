import {
  Prisma,
  RetrievalEmbeddingSourceType,
  SemanticRetrievalRunStatus,
} from "@prisma/client";

import { writeRowsForLiveCandidates } from "@/lib/privacy/erasure-guard";
import { prisma } from "@/lib/prisma";
import type { SemanticApplicationScore } from "@/lib/retrieval/semantic-retrieval-types";

type Db = Prisma.TransactionClient | typeof prisma;

const resultSelect = {
  id: true,
  companyId: true,
  runId: true,
  applicationId: true,
  candidateId: true,
  rank: true,
  semanticScore: true,
  supportingEvidenceId: true,
  method: true,
  createdAt: true,
} satisfies Prisma.SemanticRetrievalResultSelect;

const runSelect = {
  id: true,
  companyId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  jobIntelligenceRunId: true,
  status: true,
  retrievalVersion: true,
  queryConstructionVersion: true,
  representationVersion: true,
  normalizationVersion: true,
  ontologyVersion: true,
  embeddingProvider: true,
  embeddingModel: true,
  embeddingModelVersion: true,
  embeddingDimensions: true,
  resultLimit: true,
  searchedCount: true,
  retrievedCount: true,
  queryHash: true,
  evidenceSnapshotHash: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  results: {
    select: resultSelect,
    orderBy: { rank: "asc" },
  },
} satisfies Prisma.SemanticRetrievalRunSelect;

export type SemanticRetrievalRunRow = Prisma.SemanticRetrievalRunGetPayload<{
  select: typeof runSelect;
}>;

export type SemanticRetrievalIdempotencyKey = {
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number;
  retrievalVersion: string;
  queryConstructionVersion: string;
  representationVersion: string;
  normalizationVersion: string;
  ontologyVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingModelVersion: string;
  embeddingDimensions: number;
  resultLimit: number;
  queryHash: string;
  evidenceSnapshotHash: string;
};

export type RetrievalEmbeddingLookup = {
  companyId: number;
  sourceType: RetrievalEmbeddingSourceType;
  sourceIds: number[];
  modelProvider: string;
  modelName: string;
  modelVersion: string;
  normalizationVersion: string;
};

export async function listRetrievalEmbeddings(
  lookup: RetrievalEmbeddingLookup,
  db: Db = prisma,
) {
  if (lookup.sourceIds.length === 0) {
    return [];
  }
  return db.retrievalEmbedding.findMany({
    where: {
      companyId: lookup.companyId,
      sourceType: lookup.sourceType,
      sourceId: { in: lookup.sourceIds },
      modelProvider: lookup.modelProvider,
      modelName: lookup.modelName,
      modelVersion: lookup.modelVersion,
      normalizationVersion: lookup.normalizationVersion,
    },
    select: {
      id: true,
      companyId: true,
      sourceType: true,
      sourceId: true,
      contentHash: true,
      modelProvider: true,
      modelName: true,
      modelVersion: true,
      dimensions: true,
      normalizationVersion: true,
      vector: true,
    },
  });
}

export async function createRetrievalEmbeddings(
  rows: Array<{
    companyId: number;
    sourceType: RetrievalEmbeddingSourceType;
    sourceId: number;
    contentHash: string;
    modelProvider: string;
    modelName: string;
    modelVersion: string;
    dimensions: number;
    normalizationVersion: string;
    vector: number[];
  }>,
  db: Db = prisma,
) {
  if (rows.length === 0) {
    return;
  }
  await db.retrievalEmbedding.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

export async function findCompletedSemanticRetrievalRun(
  key: SemanticRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.findFirst({
    where: {
      ...key,
      status: SemanticRetrievalRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

export async function findLatestRunningSemanticRetrievalRun(
  key: SemanticRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.findFirst({
    where: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      jobIntelligenceRunId: key.jobIntelligenceRunId,
      retrievalVersion: key.retrievalVersion,
      queryConstructionVersion: key.queryConstructionVersion,
      representationVersion: key.representationVersion,
      normalizationVersion: key.normalizationVersion,
      ontologyVersion: key.ontologyVersion,
      embeddingProvider: key.embeddingProvider,
      embeddingModel: key.embeddingModel,
      embeddingModelVersion: key.embeddingModelVersion,
      embeddingDimensions: key.embeddingDimensions,
      resultLimit: key.resultLimit,
      queryHash: key.queryHash,
      evidenceSnapshotHash: key.evidenceSnapshotHash,
      status: SemanticRetrievalRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSemanticRetrievalRun(
  key: SemanticRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.create({
    data: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      jobIntelligenceRunId: key.jobIntelligenceRunId,
      status: SemanticRetrievalRunStatus.RUNNING,
      retrievalVersion: key.retrievalVersion,
      queryConstructionVersion: key.queryConstructionVersion,
      representationVersion: key.representationVersion,
      normalizationVersion: key.normalizationVersion,
      ontologyVersion: key.ontologyVersion,
      embeddingProvider: key.embeddingProvider,
      embeddingModel: key.embeddingModel,
      embeddingModelVersion: key.embeddingModelVersion,
      embeddingDimensions: key.embeddingDimensions,
      resultLimit: key.resultLimit,
      queryHash: key.queryHash,
      evidenceSnapshotHash: key.evidenceSnapshotHash,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createSemanticRetrievalResults(
  input: {
    companyId: number;
    runId: number;
    method: string;
    rows: SemanticApplicationScore[];
  },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  // Rows for an erased candidate are dropped, so a stale run cannot put a snapshot back.
  await writeRowsForLiveCandidates(db, input.companyId, input.rows, (tx, live) =>
      tx.semanticRetrievalResult.createMany({
      data: live.map((row, index) => ({
        companyId: input.companyId,
        runId: input.runId,
        applicationId: row.applicationId,
        candidateId: row.candidateId,
        rank: index + 1,
        semanticScore: row.semanticScore,
        supportingEvidenceId: row.supportingEvidenceId,
        method: input.method,
      })),
    }),
  );
}

export async function markSemanticRetrievalRunCompleted(
  runId: number,
  companyId: number,
  counts: { searchedCount: number; retrievedCount: number },
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: SemanticRetrievalRunStatus.RUNNING,
    },
    data: {
      status: SemanticRetrievalRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
      searchedCount: counts.searchedCount,
      retrievedCount: counts.retrievedCount,
    },
  });
}

export async function markSemanticRetrievalRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: SemanticRetrievalRunStatus.RUNNING,
    },
    data: {
      status: SemanticRetrievalRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getSemanticRetrievalRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listSemanticRetrievalRunsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.semanticRetrievalRun.findMany({
    where: { jobId, companyId },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });
}
