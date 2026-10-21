import { HybridRetrievalRunStatus, type Prisma } from "@prisma/client";

import { writeRowsForLiveCandidates } from "@/lib/privacy/erasure-guard";
import { prisma } from "@/lib/prisma";
import type { HybridFusionRow } from "@/lib/retrieval/hybrid-engine";
import {
  HYBRID_DATASET_VERSION,
  HYBRID_FUSION_VERSION,
  HYBRID_RRF_K,
} from "@/lib/retrieval/hybrid-retrieval-versions";

type Db = Prisma.TransactionClient | typeof prisma;

const resultSelect = {
  id: true,
  companyId: true,
  runId: true,
  applicationId: true,
  candidateId: true,
  rank: true,
  rrfScore: true,
  lexicalRank: true,
  semanticRank: true,
  fusionVersion: true,
  createdAt: true,
} satisfies Prisma.HybridRetrievalResultSelect;

const runSelect = {
  id: true,
  companyId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  lexicalRunId: true,
  semanticRunId: true,
  status: true,
  fusionVersion: true,
  rrfK: true,
  resultLimit: true,
  datasetVersion: true,
  lexicalRetrievalVersion: true,
  semanticRetrievalVersion: true,
  retrievedCount: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  results: {
    select: resultSelect,
    orderBy: { rank: "asc" as const },
  },
} satisfies Prisma.HybridRetrievalRunSelect;

export type HybridRetrievalRunRow = Prisma.HybridRetrievalRunGetPayload<{
  select: typeof runSelect;
}>;

export type HybridRetrievalIdempotencyKey = {
  companyId: number;
  lexicalRunId: number;
  semanticRunId: number;
  fusionVersion: string;
  rrfK: number;
  resultLimit: number;
  datasetVersion: string;
};

export async function findCompletedHybridRetrievalRun(
  key: HybridRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.findFirst({
    where: { ...key, status: HybridRetrievalRunStatus.COMPLETED },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

export async function findLatestRunningHybridRetrievalRun(
  key: HybridRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.findFirst({
    where: { ...key, status: HybridRetrievalRunStatus.RUNNING },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { id: "desc" },
  });
}

export async function createHybridRetrievalRun(
  input: HybridRetrievalIdempotencyKey & {
    jobId: number;
    jobSpecificationVersionId: number;
    lexicalRetrievalVersion: string;
    semanticRetrievalVersion: string;
  },
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.create({
    data: {
      ...input,
      status: HybridRetrievalRunStatus.RUNNING,
      fusionVersion: input.fusionVersion || HYBRID_FUSION_VERSION,
      rrfK: input.rrfK || HYBRID_RRF_K,
      datasetVersion: input.datasetVersion || HYBRID_DATASET_VERSION,
    },
    select: runSelect,
  });
}

export async function createHybridRetrievalResults(
  input: { companyId: number; runId: number; rows: HybridFusionRow[] },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  // Rows for an erased candidate are dropped, so a stale run cannot put a snapshot back.
  await writeRowsForLiveCandidates(db, input.companyId, input.rows, (tx, live) =>
      tx.hybridRetrievalResult.createMany({
      data: live.map((row, index) => ({
        companyId: input.companyId,
        runId: input.runId,
        applicationId: row.applicationId,
        candidateId: row.candidateId,
        rank: index + 1,
        rrfScore: row.rrfScore,
        lexicalRank: row.lexicalRank,
        semanticRank: row.semanticRank,
        fusionVersion: row.fusionVersion,
      })),
    }),
  );
}

export async function markHybridRetrievalRunCompleted(
  runId: number,
  companyId: number,
  retrievedCount: number,
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.updateMany({
    where: { id: runId, companyId, status: HybridRetrievalRunStatus.RUNNING },
    data: {
      status: HybridRetrievalRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
      retrievedCount,
    },
  });
}

export async function markHybridRetrievalRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.updateMany({
    where: { id: runId, companyId, status: HybridRetrievalRunStatus.RUNNING },
    data: {
      status: HybridRetrievalRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getHybridRetrievalRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listHybridRetrievalRunsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.hybridRetrievalRun.findMany({
    where: { jobId, companyId, status: HybridRetrievalRunStatus.COMPLETED },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

const baselineResultSelect = {
  applicationId: true,
  candidateId: true,
  companyId: true,
  rank: true,
} satisfies Prisma.LexicalRetrievalResultSelect;

export async function getLexicalBaselineForHybrid(
  runId: number,
  companyId: number,
) {
  return prisma.lexicalRetrievalRun.findFirst({
    where: { id: runId, companyId },
    select: {
      id: true,
      companyId: true,
      jobId: true,
      jobSpecificationVersionId: true,
      status: true,
      retrievalVersion: true,
      resultLimit: true,
      results: { select: baselineResultSelect, orderBy: { rank: "asc" } },
    },
  });
}

export async function getSemanticBaselineForHybrid(
  runId: number,
  companyId: number,
) {
  return prisma.semanticRetrievalRun.findFirst({
    where: { id: runId, companyId },
    select: {
      id: true,
      companyId: true,
      jobId: true,
      jobSpecificationVersionId: true,
      status: true,
      retrievalVersion: true,
      resultLimit: true,
      results: { select: baselineResultSelect, orderBy: { rank: "asc" } },
    },
  });
}

export async function listCompletedBaselineChoices(jobId: number, companyId: number) {
  const [lexicalRuns, semanticRuns] = await Promise.all([
    prisma.lexicalRetrievalRun.findMany({
      where: { jobId, companyId, status: "COMPLETED" },
      select: { id: true, resultLimit: true, retrievedCount: true },
      orderBy: { id: "desc" },
    }),
    prisma.semanticRetrievalRun.findMany({
      where: { jobId, companyId, status: "COMPLETED" },
      select: { id: true, resultLimit: true, retrievedCount: true },
      orderBy: { id: "desc" },
    }),
  ]);
  return { lexicalRuns, semanticRuns };
}
