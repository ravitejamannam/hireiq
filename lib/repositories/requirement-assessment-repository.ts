import {
  CandidateClaimType,
  CandidateIntelligenceRunStatus,
  Prisma,
  RequirementAssessmentRunStatus,
} from "@prisma/client";

import type { RequirementAssessmentDraft } from "@/lib/candidates/matching/matching-v2-types";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const assessmentSelect = {
  id: true,
  companyId: true,
  runId: true,
  applicationId: true,
  candidateId: true,
  jobRequirementId: true,
  supportState: true,
  method: true,
  reasonCode: true,
  claimId: true,
  evidenceId: true,
  createdAt: true,
} satisfies Prisma.RequirementAssessmentSelect;

const runSelect = {
  id: true,
  companyId: true,
  applicationId: true,
  candidateId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  jobIntelligenceRunId: true,
  status: true,
  matcherVersion: true,
  ontologyVersion: true,
  intelligenceSnapshotHash: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  assessments: {
    select: assessmentSelect,
    orderBy: { id: "asc" },
  },
} satisfies Prisma.RequirementAssessmentRunSelect;

export type RequirementAssessmentRunRow = Prisma.RequirementAssessmentRunGetPayload<{
  select: typeof runSelect;
}>;

export type MatcherV2IdempotencyKey = {
  companyId: number;
  applicationId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number;
  matcherVersion: string;
  ontologyVersion: string;
  intelligenceSnapshotHash: string;
};

export async function findCompletedAssessmentRun(
  key: MatcherV2IdempotencyKey,
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.findFirst({
    where: {
      ...key,
      status: RequirementAssessmentRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

export async function findLatestRunningAssessmentRun(
  key: MatcherV2IdempotencyKey,
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.findFirst({
    where: {
      companyId: key.companyId,
      applicationId: key.applicationId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      jobIntelligenceRunId: key.jobIntelligenceRunId,
      matcherVersion: key.matcherVersion,
      ontologyVersion: key.ontologyVersion,
      intelligenceSnapshotHash: key.intelligenceSnapshotHash,
      status: RequirementAssessmentRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAssessmentRun(
  input: MatcherV2IdempotencyKey & {
    candidateId: number;
    jobId: number;
  },
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.create({
    data: {
      companyId: input.companyId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      jobIntelligenceRunId: input.jobIntelligenceRunId,
      status: RequirementAssessmentRunStatus.RUNNING,
      matcherVersion: input.matcherVersion,
      ontologyVersion: input.ontologyVersion,
      intelligenceSnapshotHash: input.intelligenceSnapshotHash,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createRequirementAssessments(
  input: {
    companyId: number;
    runId: number;
    applicationId: number;
    candidateId: number;
    rows: RequirementAssessmentDraft[];
  },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  await db.requirementAssessment.createMany({
    data: input.rows.map((row) => ({
      companyId: input.companyId,
      runId: input.runId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobRequirementId: row.jobRequirementId,
      supportState: row.supportState,
      method: row.method,
      reasonCode: row.reasonCode,
      claimId: row.claimId,
      evidenceId: row.evidenceId,
    })),
  });
}

export async function markAssessmentRunCompleted(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: RequirementAssessmentRunStatus.RUNNING,
    },
    data: {
      status: RequirementAssessmentRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
    },
  });
}

export async function markAssessmentRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: RequirementAssessmentRunStatus.RUNNING,
    },
    data: {
      status: RequirementAssessmentRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getAssessmentRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listLatestAssessmentRunsForJob(
  jobId: number,
  companyId: number,
  jobSpecificationVersionId: number,
  db: Db = prisma,
) {
  return db.requirementAssessmentRun.findMany({
    where: {
      jobId,
      companyId,
      jobSpecificationVersionId,
      status: RequirementAssessmentRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function listApplicationsForJobExplanation(
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
      candidate: { select: { id: true, name: true, companyId: true } },
    },
    orderBy: { id: "asc" },
  });
}

export async function listEligibleEvidenceForCandidate(
  input: { companyId: number; candidateId: number; applicationId: number },
  db: Db = prisma,
) {
  return db.candidateEvidence.findMany({
    where: {
      companyId: input.companyId,
      candidateId: input.candidateId,
      revokedAt: null,
      supersededById: null,
      OR: [{ applicationId: input.applicationId }, { applicationId: null }],
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      inlineText: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function listCompletedClaimsForEvidence(
  evidenceIds: number[],
  companyId: number,
  candidateId: number,
  db: Db = prisma,
) {
  if (evidenceIds.length === 0) {
    return [];
  }
  return db.candidateClaim.findMany({
    where: {
      companyId,
      candidateId,
      evidenceId: { in: evidenceIds },
      run: { status: CandidateIntelligenceRunStatus.COMPLETED, companyId },
      claimType: { in: [CandidateClaimType.SKILL, CandidateClaimType.LOCATION] },
    },
    select: {
      id: true,
      evidenceId: true,
      runId: true,
      claimType: true,
      normalizedValue: true,
      polarity: true,
      value: true,
    },
    orderBy: { id: "asc" },
  });
}
