import { LexicalRetrievalRunStatus, Prisma } from "@prisma/client";

import { writeRowsForLiveCandidates } from "@/lib/privacy/erasure-guard";
import type { LexicalApplicationScore } from "@/lib/retrieval/lexical-retrieval-types";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const resultSelect = {
  id: true,
  companyId: true,
  runId: true,
  applicationId: true,
  candidateId: true,
  rank: true,
  lexicalScore: true,
  matchedTerms: true,
  method: true,
  createdAt: true,
} satisfies Prisma.LexicalRetrievalResultSelect;

const runSelect = {
  id: true,
  companyId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  jobIntelligenceRunId: true,
  status: true,
  retrievalVersion: true,
  queryConstructionVersion: true,
  normalizationVersion: true,
  ontologyVersion: true,
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
} satisfies Prisma.LexicalRetrievalRunSelect;

export type LexicalRetrievalRunRow = Prisma.LexicalRetrievalRunGetPayload<{
  select: typeof runSelect;
}>;

export type LexicalRetrievalIdempotencyKey = {
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number;
  retrievalVersion: string;
  queryConstructionVersion: string;
  normalizationVersion: string;
  ontologyVersion: string;
  resultLimit: number;
  queryHash: string;
  evidenceSnapshotHash: string;
};

export async function listApplicationsForLexicalRetrieval(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.findMany({
    where: { jobId, companyId },
    select: {
      id: true,
      candidateId: true,
      companyId: true,
      jobId: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function listEligibleEvidenceForLexicalRetrieval(input: {
  companyId: number;
  candidateIds: number[];
  applicationIds: number[];
}, db: Db = prisma) {
  if (input.candidateIds.length === 0) {
    return [];
  }
  return db.candidateEvidence.findMany({
    where: {
      companyId: input.companyId,
      candidateId: { in: input.candidateIds },
      revokedAt: null,
      supersededById: null,
      OR: [{ applicationId: null }, { applicationId: { in: input.applicationIds } }],
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      applicationId: true,
      inlineText: true,
      contentSha256: true,
      revokedAt: true,
      supersededById: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function findCompletedLexicalRetrievalRun(
  key: LexicalRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.findFirst({
    where: {
      ...key,
      status: LexicalRetrievalRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

export async function findLatestRunningLexicalRetrievalRun(
  key: LexicalRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.findFirst({
    where: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      jobIntelligenceRunId: key.jobIntelligenceRunId,
      retrievalVersion: key.retrievalVersion,
      queryConstructionVersion: key.queryConstructionVersion,
      normalizationVersion: key.normalizationVersion,
      ontologyVersion: key.ontologyVersion,
      resultLimit: key.resultLimit,
      queryHash: key.queryHash,
      evidenceSnapshotHash: key.evidenceSnapshotHash,
      status: LexicalRetrievalRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createLexicalRetrievalRun(
  key: LexicalRetrievalIdempotencyKey,
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.create({
    data: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      jobIntelligenceRunId: key.jobIntelligenceRunId,
      status: LexicalRetrievalRunStatus.RUNNING,
      retrievalVersion: key.retrievalVersion,
      queryConstructionVersion: key.queryConstructionVersion,
      normalizationVersion: key.normalizationVersion,
      ontologyVersion: key.ontologyVersion,
      resultLimit: key.resultLimit,
      queryHash: key.queryHash,
      evidenceSnapshotHash: key.evidenceSnapshotHash,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createLexicalRetrievalResults(
  input: {
    companyId: number;
    runId: number;
    method: string;
    rows: LexicalApplicationScore[];
  },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  // Rows for an erased candidate are dropped, so a stale run cannot put a snapshot back.
  await writeRowsForLiveCandidates(db, input.companyId, input.rows, (tx, live) =>
      tx.lexicalRetrievalResult.createMany({
      data: live.map((row, index) => ({
        companyId: input.companyId,
        runId: input.runId,
        applicationId: row.applicationId,
        candidateId: row.candidateId,
        rank: index + 1,
        lexicalScore: row.lexicalScore,
        matchedTerms: row.matchedTerms,
        method: input.method,
      })),
    }),
  );
}

export async function markLexicalRetrievalRunCompleted(
  runId: number,
  companyId: number,
  counts: { searchedCount: number; retrievedCount: number },
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: LexicalRetrievalRunStatus.RUNNING,
    },
    data: {
      status: LexicalRetrievalRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
      searchedCount: counts.searchedCount,
      retrievedCount: counts.retrievedCount,
    },
  });
}

export async function markLexicalRetrievalRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: LexicalRetrievalRunStatus.RUNNING,
    },
    data: {
      status: LexicalRetrievalRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getLexicalRetrievalRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listLexicalRetrievalRunsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.lexicalRetrievalRun.findMany({
    where: { jobId, companyId },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });
}
