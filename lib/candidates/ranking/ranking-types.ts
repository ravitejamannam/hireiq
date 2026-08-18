import type {
  JobRankingCoverageStatus,
  JobRankingRunStatus,
} from "@prisma/client";

export type RankingSkillResult = {
  category: string;
  result: string;
};

export type RankingApplicationInput = {
  applicationId: number;
  candidateId: number;
  candidateMatchRunId: number | null;
  requirementRows: RankingSkillResult[];
};

export type RankingResultDraft = {
  applicationId: number;
  candidateId: number;
  candidateMatchRunId: number | null;
  rank: number | null;
  satisfiedSkillCount: number | null;
  unknownSkillCount: number | null;
  coverageStatus: JobRankingCoverageStatus;
};

export type RankingComputation =
  | { kind: "no_match_runs" }
  | {
      kind: "ranked";
      results: RankingResultDraft[];
      rankedCount: number;
      unrankedCount: number;
    };

export type SafeJobRankingResult = {
  id: number;
  companyId: number;
  runId: number;
  applicationId: number;
  candidateId: number;
  candidateMatchRunId: number | null;
  rank: number | null;
  satisfiedSkillCount: number | null;
  unknownSkillCount: number | null;
  coverageStatus: JobRankingCoverageStatus;
  createdAt: Date;
};

export type SafeJobRankingRun = {
  id: number;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  status: JobRankingRunStatus;
  rankingPolicyVersion: string;
  matcherVersion: string;
  requirementParseVersion: string;
  aliasMapVersion: string;
  applicationSetHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  durationMs: number | null;
  rankedCount: number;
  unrankedCount: number;
  results: SafeJobRankingResult[];
};

export type RankingPublishedSpec = {
  id: number;
  jobId: number;
  versionNumber: number;
  title: string;
  primarySkills: string | null;
  location: string | null;
};

export type JobRankingPageData = {
  jobId: number;
  companyId: number;
  publishedSpecs: RankingPublishedSpec[];
  runs: SafeJobRankingRun[];
};
