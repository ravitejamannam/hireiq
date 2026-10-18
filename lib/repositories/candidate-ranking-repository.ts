import {
  CandidateMatchRunStatus,
  JobRankingRunStatus,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { RankingResultDraft } from "@/lib/candidates/ranking/ranking-types";

type Db = Prisma.TransactionClient | typeof prisma;

const rankingResultSelect = {
  id: true,
  companyId: true,
  runId: true,
  applicationId: true,
  candidateId: true,
  candidateMatchRunId: true,
  rank: true,
  satisfiedSkillCount: true,
  unknownSkillCount: true,
  coverageStatus: true,
  createdAt: true,
} satisfies Prisma.JobRankingResultSelect;

const rankingRunSelect = {
  id: true,
  companyId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  status: true,
  rankingPolicyVersion: true,
  matcherVersion: true,
  requirementParseVersion: true,
  aliasMapVersion: true,
  applicationSetHash: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  durationMs: true,
  rankedCount: true,
  unrankedCount: true,
  results: {
    select: rankingResultSelect,
    orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { applicationId: "asc" }],
  },
} satisfies Prisma.JobRankingRunSelect;

export type JobRankingRunRow = Prisma.JobRankingRunGetPayload<{
  select: typeof rankingRunSelect;
}>;

export type RankingJobRow = {
  id: number;
  companyId: number;
};

export type RankingApplicationRow = {
  id: number;
  companyId: number;
  candidateId: number;
  jobId: number;
  candidate: { id: number; companyId: number };
  job: { id: number; companyId: number };
};

export type RankingSpecRow = {
  id: number;
  jobId: number;
  versionNumber: number;
  status: JobSpecificationVersionStatus;
  title: string;
  primarySkills: string | null;
  location: string | null;
};

export type RankingMatchRunRow = {
  id: number;
  companyId: number;
  applicationId: number;
  candidateId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  status: CandidateMatchRunStatus;
  matcherVersion: string;
  requirementParseVersion: string;
  aliasMapVersion: string;
  completedAt: Date | null;
  requirementMatches: Array<{
    category: string;
    result: string;
  }>;
};

export type RankingIdempotencyKey = {
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  rankingPolicyVersion: string;
  matcherVersion: string;
  requirementParseVersion: string;
  aliasMapVersion: string;
  applicationSetHash: string;
};

export async function getJobForRanking(
  jobId: number,
  db: Db = prisma,
): Promise<RankingJobRow | null> {
  const row = await db.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!row) {
    return null;
  }
  return db.job.findFirst({
    where: { id: row.id, companyId: row.companyId },
    select: { id: true, companyId: true },
  });
}

export async function getSpecificationForRanking(
  specificationId: number,
  db: Db = prisma,
): Promise<RankingSpecRow | null> {
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
    },
  });
}

export async function listPublishedSpecsForJob(
  jobId: number,
  db: Db = prisma,
) {
  return db.jobSpecificationVersion.findMany({
    where: {
      jobId,
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
    },
    orderBy: { versionNumber: "desc" },
  });
}

export async function listApplicationsForJobRanking(
  jobId: number,
  companyId: number,
  db: Db = prisma,
): Promise<RankingApplicationRow[]> {
  return db.application.findMany({
    where: { jobId, companyId, aiEvaluationOptOut: false },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      jobId: true,
      candidate: { select: { id: true, companyId: true } },
      job: { select: { id: true, companyId: true } },
    },
    orderBy: { id: "asc" },
  });
}

export async function listCompletedMatchRunsForRanking(
  input: {
    companyId: number;
    jobId: number;
    jobSpecificationVersionId: number;
    matcherVersion: string;
    requirementParseVersion: string;
    aliasMapVersion: string;
  },
  db: Db = prisma,
): Promise<RankingMatchRunRow[]> {
  return db.candidateMatchRun.findMany({
    where: {
      companyId: input.companyId,
      jobId: input.jobId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      matcherVersion: input.matcherVersion,
      requirementParseVersion: input.requirementParseVersion,
      aliasMapVersion: input.aliasMapVersion,
      status: CandidateMatchRunStatus.COMPLETED,
    },
    select: {
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
      completedAt: true,
      requirementMatches: {
        select: {
          category: true,
          result: true,
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
  });
}

export async function findCompletedRankingRun(
  key: RankingIdempotencyKey,
  db: Db = prisma,
) {
  return db.jobRankingRun.findFirst({
    where: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      rankingPolicyVersion: key.rankingPolicyVersion,
      matcherVersion: key.matcherVersion,
      requirementParseVersion: key.requirementParseVersion,
      aliasMapVersion: key.aliasMapVersion,
      applicationSetHash: key.applicationSetHash,
      status: JobRankingRunStatus.COMPLETED,
    },
    select: rankingRunSelect,
    orderBy: { id: "asc" },
  });
}

export async function findLatestRunningRankingRun(
  key: RankingIdempotencyKey,
  db: Db = prisma,
) {
  return db.jobRankingRun.findFirst({
    where: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      rankingPolicyVersion: key.rankingPolicyVersion,
      matcherVersion: key.matcherVersion,
      requirementParseVersion: key.requirementParseVersion,
      aliasMapVersion: key.aliasMapVersion,
      applicationSetHash: key.applicationSetHash,
      status: JobRankingRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRankingRun(
  key: RankingIdempotencyKey,
  db: Db = prisma,
) {
  return db.jobRankingRun.create({
    data: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      status: JobRankingRunStatus.RUNNING,
      rankingPolicyVersion: key.rankingPolicyVersion,
      matcherVersion: key.matcherVersion,
      requirementParseVersion: key.requirementParseVersion,
      aliasMapVersion: key.aliasMapVersion,
      applicationSetHash: key.applicationSetHash,
      rankedCount: 0,
      unrankedCount: 0,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createRankingResults(
  input: {
    companyId: number;
    runId: number;
    rows: RankingResultDraft[];
  },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  await db.jobRankingResult.createMany({
    data: input.rows.map((row) => ({
      companyId: input.companyId,
      runId: input.runId,
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      candidateMatchRunId: row.candidateMatchRunId,
      rank: row.rank,
      satisfiedSkillCount: row.satisfiedSkillCount,
      unknownSkillCount: row.unknownSkillCount,
      coverageStatus: row.coverageStatus,
    })),
  });
}

export async function markRankingRunCompleted(
  input: {
    runId: number;
    companyId: number;
    rankedCount: number;
    unrankedCount: number;
    durationMs: number;
  },
  db: Db = prisma,
) {
  return db.jobRankingRun.updateMany({
    where: {
      id: input.runId,
      companyId: input.companyId,
      status: JobRankingRunStatus.RUNNING,
    },
    data: {
      status: JobRankingRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
      rankedCount: input.rankedCount,
      unrankedCount: input.unrankedCount,
      durationMs: input.durationMs,
    },
  });
}

export async function markRankingRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.jobRankingRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: {
        in: [JobRankingRunStatus.RUNNING, JobRankingRunStatus.FAILED],
      },
    },
    data: {
      status: JobRankingRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
      rankedCount: 0,
      unrankedCount: 0,
    },
  });
}

export async function getRankingRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobRankingRun.findFirst({
    where: { id: runId, companyId },
    select: rankingRunSelect,
  });
}

export async function listRankingRunsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobRankingRun.findMany({
    where: { jobId, companyId },
    select: rankingRunSelect,
    orderBy: { createdAt: "desc" },
  });
}
