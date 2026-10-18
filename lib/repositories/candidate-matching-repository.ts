import {
  CandidateClaimType,
  CandidateIntelligenceRunStatus,
  CandidateMatchRunStatus,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { RequirementMatchDraft } from "@/lib/candidates/matching/matching-types";

type Db = Prisma.TransactionClient | typeof prisma;

const requirementSelect = {
  id: true,
  companyId: true,
  runId: true,
  requirementKey: true,
  sourceField: true,
  category: true,
  result: true,
  reasonCode: true,
  claimId: true,
  evidenceId: true,
  createdAt: true,
} satisfies Prisma.RequirementMatchSelect;

const matchRunSelect = {
  id: true,
  companyId: true,
  applicationId: true,
  candidateId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  status: true,
  matcherVersion: true,
  requirementParseVersion: true,
  aliasMapVersion: true,
  intelligenceSnapshotHash: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  requirementMatches: {
    select: requirementSelect,
    orderBy: { id: "asc" },
  },
} satisfies Prisma.CandidateMatchRunSelect;

export type CandidateMatchRunRow = Prisma.CandidateMatchRunGetPayload<{
  select: typeof matchRunSelect;
}>;

export type MatchingApplicationRow = {
  id: number;
  companyId: number;
  candidateId: number;
  jobId: number;
  status: string;
  source: string | null;
  expertScore: number | null;
  job: {
    id: number;
    companyId: number;
    title: string;
  };
  candidate: {
    id: number;
    companyId: number;
    location: string | null;
  };
};

export type MatchingSpecRow = {
  id: number;
  jobId: number;
  versionNumber: number;
  status: JobSpecificationVersionStatus;
  title: string;
  primarySkills: string | null;
  location: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  structuredPayload?: unknown;
};

export type MatchingEvidenceRow = {
  id: number;
  companyId: number;
  candidateId: number;
  applicationId: number | null;
  revokedAt: Date | null;
  supersededById: number | null;
};

export type MatchingClaimRow = {
  id: number;
  companyId: number;
  candidateId: number;
  runId: number;
  evidenceId: number;
  claimType: CandidateClaimType;
  normalizedValue: string | null;
  createdAt: Date;
};

export type MatchingIdempotencyKey = {
  companyId: number;
  applicationId: number;
  jobSpecificationVersionId: number;
  matcherVersion: string;
  requirementParseVersion: string;
  aliasMapVersion: string;
  intelligenceSnapshotHash: string;
};

export async function findCandidateHandle(
  candidateId: number,
  db: Db = prisma,
) {
  return db.candidate.findFirst({
    where: { id: candidateId },
    select: { id: true, companyId: true },
  });
}

export async function getApplicationForMatching(
  applicationId: number,
  db: Db = prisma,
): Promise<MatchingApplicationRow | null> {
  const row = await db.application.findFirst({
    where: { id: applicationId },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      jobId: true,
      status: true,
      source: true,
      expertScore: true,
      job: {
        select: { id: true, companyId: true, title: true },
      },
      candidate: {
        select: { id: true, companyId: true, location: true },
      },
    },
  });
  if (!row) {
    return null;
  }
  return db.application.findFirst({
    where: { id: row.id, companyId: row.companyId },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      jobId: true,
      status: true,
      source: true,
      expertScore: true,
      job: {
        select: { id: true, companyId: true, title: true },
      },
      candidate: {
        select: { id: true, companyId: true, location: true },
      },
    },
  });
}

export async function getSpecificationForMatching(
  specificationId: number,
  db: Db = prisma,
): Promise<MatchingSpecRow | null> {
  return db.jobSpecificationVersion.findFirst({
    where: { id: specificationId },
    select: {
      id: true,
      jobId: true,
      versionNumber: true,
      status: true,
      title: true,
      primarySkills: true,
      location: true,
      mustHaveRequirements: true,
      niceToHaveRequirements: true,
      structuredPayload: true,
    },
  });
}

export async function listPublishedSpecsForJobs(
  jobIds: number[],
  db: Db = prisma,
) {
  if (jobIds.length === 0) {
    return [] as MatchingSpecRow[];
  }
  return db.jobSpecificationVersion.findMany({
    where: {
      jobId: { in: jobIds },
      status: JobSpecificationVersionStatus.PUBLISHED,
    },
    select: {
      id: true,
      jobId: true,
      versionNumber: true,
      status: true,
      title: true,
      primarySkills: true,
      location: true,
      mustHaveRequirements: true,
      niceToHaveRequirements: true,
    },
    orderBy: [{ jobId: "asc" }, { versionNumber: "desc" }],
  });
}

export async function listApplicationsForCandidateMatching(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.findMany({
    where: { candidateId, companyId },
    select: {
      id: true,
      jobId: true,
      job: { select: { title: true } },
    },
    orderBy: { id: "asc" },
  });
}

export async function listEligibleEvidenceForApplication(
  input: {
    companyId: number;
    candidateId: number;
    applicationId: number;
  },
  db: Db = prisma,
): Promise<MatchingEvidenceRow[]> {
  return db.candidateEvidence.findMany({
    where: {
      companyId: input.companyId,
      candidateId: input.candidateId,
      revokedAt: null,
      supersededById: null,
      OR: [{ applicationId: null }, { applicationId: input.applicationId }],
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      applicationId: true,
      revokedAt: true,
      supersededById: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function getLatestCompletedIntelligenceRun(
  evidenceId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIntelligenceRun.findFirst({
    where: {
      evidenceId,
      companyId,
      status: CandidateIntelligenceRunStatus.COMPLETED,
    },
    select: {
      id: true,
      companyId: true,
      evidenceId: true,
      completedAt: true,
      status: true,
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
  });
}

export async function listClaimsForRuns(
  runIds: number[],
  companyId: number,
  candidateId: number,
  db: Db = prisma,
): Promise<MatchingClaimRow[]> {
  if (runIds.length === 0) {
    return [];
  }
  return db.candidateClaim.findMany({
    where: {
      companyId,
      candidateId,
      runId: { in: runIds },
      claimType: {
        in: [CandidateClaimType.SKILL, CandidateClaimType.LOCATION],
      },
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      runId: true,
      evidenceId: true,
      claimType: true,
      normalizedValue: true,
      createdAt: true,
    },
    orderBy: [{ id: "desc" }],
  });
}

export async function findCompletedMatchRun(
  key: MatchingIdempotencyKey,
  db: Db = prisma,
) {
  return db.candidateMatchRun.findFirst({
    where: {
      companyId: key.companyId,
      applicationId: key.applicationId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      matcherVersion: key.matcherVersion,
      requirementParseVersion: key.requirementParseVersion,
      aliasMapVersion: key.aliasMapVersion,
      intelligenceSnapshotHash: key.intelligenceSnapshotHash,
      status: CandidateMatchRunStatus.COMPLETED,
    },
    select: matchRunSelect,
    orderBy: { id: "asc" },
  });
}

export async function findLatestRunningMatchRun(
  key: MatchingIdempotencyKey,
  db: Db = prisma,
) {
  return db.candidateMatchRun.findFirst({
    where: {
      companyId: key.companyId,
      applicationId: key.applicationId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      matcherVersion: key.matcherVersion,
      requirementParseVersion: key.requirementParseVersion,
      aliasMapVersion: key.aliasMapVersion,
      intelligenceSnapshotHash: key.intelligenceSnapshotHash,
      status: CandidateMatchRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMatchRun(
  input: MatchingIdempotencyKey & {
    candidateId: number;
    jobId: number;
  },
  db: Db = prisma,
) {
  return db.candidateMatchRun.create({
    data: {
      companyId: input.companyId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      status: CandidateMatchRunStatus.RUNNING,
      matcherVersion: input.matcherVersion,
      requirementParseVersion: input.requirementParseVersion,
      aliasMapVersion: input.aliasMapVersion,
      intelligenceSnapshotHash: input.intelligenceSnapshotHash,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createRequirementMatches(
  input: {
    companyId: number;
    runId: number;
    rows: RequirementMatchDraft[];
  },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  await db.requirementMatch.createMany({
    data: input.rows.map((row) => ({
      companyId: input.companyId,
      runId: input.runId,
      requirementKey: row.requirementKey,
      sourceField: row.sourceField,
      category: row.category,
      result: row.result,
      reasonCode: row.reasonCode,
      claimId: row.claimId,
      evidenceId: row.evidenceId,
    })),
  });
}

export async function markMatchRunCompleted(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateMatchRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: CandidateMatchRunStatus.RUNNING,
    },
    data: {
      status: CandidateMatchRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
    },
  });
}

export async function markMatchRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.candidateMatchRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: CandidateMatchRunStatus.RUNNING,
    },
    data: {
      status: CandidateMatchRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getMatchRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateMatchRun.findFirst({
    where: { id: runId, companyId },
    select: matchRunSelect,
  });
}

export async function listMatchRunsForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateMatchRun.findMany({
    where: { candidateId, companyId },
    select: matchRunSelect,
    orderBy: { createdAt: "desc" },
  });
}
