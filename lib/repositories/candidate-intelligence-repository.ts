import {
  CandidateIntelligenceExtractorType,
  CandidateIntelligenceRunStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ExtractedClaimDraft } from "@/lib/candidates/intelligence/intelligence-types";

type Db = Prisma.TransactionClient | typeof prisma;

const claimSelect = {
  id: true,
  companyId: true,
  candidateId: true,
  runId: true,
  evidenceId: true,
  claimType: true,
  value: true,
  normalizedValue: true,
  createdAt: true,
} satisfies Prisma.CandidateClaimSelect;

const runSelect = {
  id: true,
  companyId: true,
  candidateId: true,
  evidenceId: true,
  status: true,
  extractorType: true,
  extractorVersion: true,
  modelProvider: true,
  modelName: true,
  promptVersion: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  durationMs: true,
  claims: {
    select: claimSelect,
    orderBy: [{ claimType: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.CandidateIntelligenceRunSelect;

export type CandidateIntelligenceRunRow = Prisma.CandidateIntelligenceRunGetPayload<{
  select: typeof runSelect;
}>;

export type IntelligenceEvidenceRow = {
  id: number;
  companyId: number;
  candidateId: number;
  inlineText: string | null;
  revokedAt: Date | null;
  supersededById: number | null;
};

export type IntelligenceRunKey = {
  companyId: number;
  candidateId: number;
  evidenceId: number;
  extractorType: CandidateIntelligenceExtractorType;
  extractorVersion: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
};

export async function findCandidateHandle(
  candidateId: number,
  db: Db = prisma,
) {
  return db.candidate.findFirst({
    where: { id: candidateId },
    select: {
      id: true,
      companyId: true,
    },
  });
}

export async function findCandidateHandleInCompany(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidate.findFirst({
    where: { id: candidateId, companyId },
    select: {
      id: true,
      companyId: true,
    },
  });
}

export async function getEvidenceForIntelligence(
  evidenceId: number,
  companyId: number,
  db: Db = prisma,
): Promise<IntelligenceEvidenceRow | null> {
  return db.candidateEvidence.findFirst({
    where: { id: evidenceId, companyId },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      inlineText: true,
      revokedAt: true,
      supersededById: true,
    },
  });
}

export async function getEvidenceByIdForIntelligence(
  evidenceId: number,
  db: Db = prisma,
): Promise<IntelligenceEvidenceRow | null> {
  const row = await db.candidateEvidence.findFirst({
    where: { id: evidenceId },
    select: {
      id: true,
      companyId: true,
    },
  });
  if (!row) {
    return null;
  }
  return getEvidenceForIntelligence(row.id, row.companyId, db);
}

export async function findCompletedRun(
  key: IntelligenceRunKey,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.findFirst({
    where: {
      companyId: key.companyId,
      candidateId: key.candidateId,
      evidenceId: key.evidenceId,
      extractorType: key.extractorType,
      extractorVersion: key.extractorVersion,
      modelProvider: key.modelProvider,
      modelName: key.modelName,
      promptVersion: key.promptVersion,
      status: CandidateIntelligenceRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "asc" },
  });
}

export async function findLatestRunningRun(
  key: IntelligenceRunKey,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.findFirst({
    where: {
      companyId: key.companyId,
      candidateId: key.candidateId,
      evidenceId: key.evidenceId,
      extractorType: key.extractorType,
      extractorVersion: key.extractorVersion,
      modelProvider: key.modelProvider,
      modelName: key.modelName,
      promptVersion: key.promptVersion,
      status: CandidateIntelligenceRunStatus.RUNNING,
    },
    select: {
      id: true,
      companyId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createIntelligenceRun(
  key: IntelligenceRunKey,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.create({
    data: {
      companyId: key.companyId,
      candidateId: key.candidateId,
      evidenceId: key.evidenceId,
      status: CandidateIntelligenceRunStatus.RUNNING,
      extractorType: key.extractorType,
      extractorVersion: key.extractorVersion,
      modelProvider: key.modelProvider,
      modelName: key.modelName,
      promptVersion: key.promptVersion,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function markRunCompleted(
  runId: number,
  companyId: number,
  durationMs: number,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: CandidateIntelligenceRunStatus.RUNNING,
    },
    data: {
      status: CandidateIntelligenceRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
      durationMs,
    },
  });
}

export async function markRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  durationMs: number,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: CandidateIntelligenceRunStatus.RUNNING,
    },
    data: {
      status: CandidateIntelligenceRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
      durationMs,
    },
  });
}

export async function createClaimsForRun(
  input: {
    companyId: number;
    candidateId: number;
    runId: number;
    evidenceId: number;
    claims: ExtractedClaimDraft[];
  },
  db: Db = prisma,
) {
  if (input.claims.length === 0) {
    return;
  }

  await db.candidateClaim.createMany({
    data: input.claims.map((claim) => ({
      companyId: input.companyId,
      candidateId: input.candidateId,
      runId: input.runId,
      evidenceId: input.evidenceId,
      claimType: claim.claimType,
      value: claim.value,
      normalizedValue: claim.normalizedValue,
      sourceSpanStart: claim.sourceSpanStart ?? null,
      sourceSpanEnd: claim.sourceSpanEnd ?? null,
      polarity: claim.polarity,
    })),
  });
}

export async function getRunWithClaims(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listRunsForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.findMany({
    where: { candidateId, companyId },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });
}
