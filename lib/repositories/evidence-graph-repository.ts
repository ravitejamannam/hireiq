import { EvidenceGraphRunStatus, Prisma } from "@prisma/client";

import type { EvidenceGraphEdgeDraft } from "@/lib/evidence-graph/evidence-graph-types";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const edgeSelect = {
  id: true,
  companyId: true,
  runId: true,
  edgeType: true,
  fromType: true,
  fromId: true,
  toType: true,
  toId: true,
  provenance: true,
  sourceEvidenceId: true,
  sourceClaimId: true,
  sourceRequirementId: true,
  sourceAssessmentId: true,
  ontologyVersion: true,
  jobSpecificationVersionId: true,
  createdAt: true,
} satisfies Prisma.EvidenceGraphEdgeSelect;

const runSelect = {
  id: true,
  companyId: true,
  jobId: true,
  applicationId: true,
  candidateId: true,
  jobSpecificationVersionId: true,
  jobIntelligenceRunId: true,
  matcherV2RunId: true,
  status: true,
  graphVersion: true,
  ontologyVersion: true,
  matcherVersion: true,
  sourceSnapshotHash: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  edges: {
    select: edgeSelect,
    orderBy: [{ edgeType: "asc" }, { fromId: "asc" }, { toId: "asc" }],
  },
} satisfies Prisma.EvidenceGraphRunSelect;

export type EvidenceGraphRunRow = Prisma.EvidenceGraphRunGetPayload<{
  select: typeof runSelect;
}>;

export type EvidenceGraphIdempotencyKey = {
  companyId: number;
  applicationId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number | null;
  matcherV2RunId: number | null;
  graphVersion: string;
  ontologyVersion: string;
  matcherVersion: string | null;
  sourceSnapshotHash: string;
};

export async function findCompletedEvidenceGraphRun(
  key: EvidenceGraphIdempotencyKey,
  db: Db = prisma,
) {
  return db.evidenceGraphRun.findFirst({
    where: {
      ...key,
      status: EvidenceGraphRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

export async function findLatestRunningEvidenceGraphRun(
  key: EvidenceGraphIdempotencyKey,
  db: Db = prisma,
) {
  return db.evidenceGraphRun.findFirst({
    where: {
      companyId: key.companyId,
      applicationId: key.applicationId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      jobIntelligenceRunId: key.jobIntelligenceRunId,
      matcherV2RunId: key.matcherV2RunId,
      graphVersion: key.graphVersion,
      ontologyVersion: key.ontologyVersion,
      matcherVersion: key.matcherVersion,
      sourceSnapshotHash: key.sourceSnapshotHash,
      status: EvidenceGraphRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createEvidenceGraphRun(
  input: EvidenceGraphIdempotencyKey & {
    jobId: number;
    candidateId: number;
  },
  db: Db = prisma,
) {
  return db.evidenceGraphRun.create({
    data: {
      companyId: input.companyId,
      jobId: input.jobId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      jobIntelligenceRunId: input.jobIntelligenceRunId,
      matcherV2RunId: input.matcherV2RunId,
      status: EvidenceGraphRunStatus.RUNNING,
      graphVersion: input.graphVersion,
      ontologyVersion: input.ontologyVersion,
      matcherVersion: input.matcherVersion,
      sourceSnapshotHash: input.sourceSnapshotHash,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createEvidenceGraphEdges(
  input: {
    companyId: number;
    runId: number;
    edges: EvidenceGraphEdgeDraft[];
  },
  db: Db = prisma,
) {
  if (input.edges.length === 0) {
    return;
  }
  await db.evidenceGraphEdge.createMany({
    data: input.edges.map((edge) => ({
      ...edge,
      runId: input.runId,
    })),
    skipDuplicates: true,
  });
}

export async function markEvidenceGraphRunCompleted(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.evidenceGraphRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: EvidenceGraphRunStatus.RUNNING,
    },
    data: {
      status: EvidenceGraphRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
    },
  });
}

export async function markEvidenceGraphRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.evidenceGraphRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: EvidenceGraphRunStatus.RUNNING,
    },
    data: {
      status: EvidenceGraphRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getEvidenceGraphRunWithEdges(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.evidenceGraphRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listEvidenceGraphRunsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.evidenceGraphRun.findMany({
    where: { jobId, companyId },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function listGraphSourceEvidence(input: {
  companyId: number;
  candidateId: number;
  applicationId: number;
}, db: Db = prisma) {
  return db.candidateEvidence.findMany({
    where: {
      companyId: input.companyId,
      candidateId: input.candidateId,
      OR: [{ applicationId: input.applicationId }, { applicationId: null }],
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      revokedAt: true,
      supersededById: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function listGraphSourceClaims(input: {
  companyId: number;
  candidateId: number;
  evidenceIds: number[];
}, db: Db = prisma) {
  if (input.evidenceIds.length === 0) {
    return [];
  }
  return db.candidateClaim.findMany({
    where: {
      companyId: input.companyId,
      candidateId: input.candidateId,
      evidenceId: { in: input.evidenceIds },
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      evidenceId: true,
      claimType: true,
      normalizedValue: true,
      sourceSpanStart: true,
      sourceSpanEnd: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function listGraphSourceSkills(
  ontologyVersion: string,
  db: Db = prisma,
) {
  return db.skillConcept.findMany({
    where: { ontologyVersion, active: true },
    select: {
      id: true,
      canonicalKey: true,
      ontologyVersion: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function listLatestCompletedMatcherV2ForApplication(input: {
  companyId: number;
  applicationId: number;
  jobSpecificationVersionId: number;
}, db: Db = prisma) {
  return db.requirementAssessmentRun.findFirst({
    where: {
      companyId: input.companyId,
      applicationId: input.applicationId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      status: "COMPLETED",
    },
    select: {
      id: true,
      companyId: true,
      matcherVersion: true,
      assessments: {
        select: {
          id: true,
          companyId: true,
          jobRequirementId: true,
          claimId: true,
          evidenceId: true,
          supportState: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });
}
