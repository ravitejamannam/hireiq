import type {
  CandidateMatchRequirementCategory,
  CandidateMatchResult,
  CandidateMatchRunStatus,
} from "@prisma/client";

export type SafeRequirementMatch = {
  id: number;
  companyId: number;
  runId: number;
  requirementKey: string;
  sourceField: string;
  category: CandidateMatchRequirementCategory;
  result: CandidateMatchResult;
  reasonCode: string;
  claimId: number | null;
  evidenceId: number | null;
  createdAt: Date;
};

export type SafeCandidateMatchRun = {
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
  intelligenceSnapshotHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  requirementMatches: SafeRequirementMatch[];
};

export type MatchingPublishedSpec = {
  id: number;
  jobId: number;
  versionNumber: number;
  title: string;
  primarySkills: string | null;
  location: string | null;
};

export type MatchingApplicationOption = {
  id: number;
  jobId: number;
  jobTitle: string;
  publishedSpecs: MatchingPublishedSpec[];
};

export type CandidateMatchingPageData = {
  candidateId: number;
  applications: MatchingApplicationOption[];
  runs: SafeCandidateMatchRun[];
};

export type EligibleMatchingClaim = {
  id: number;
  evidenceId: number;
  runId: number;
  runCompletedAt: Date;
  claimType: "SKILL" | "LOCATION";
  normalizedValue: string;
};

export type MatchingSpecInput = {
  primarySkills: string | null;
  location: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  screeningQuestions?: string[];
  rubricCriteria?: string[];
  resumeText?: string | null;
  profileLocation?: string | null;
  verifiedProse?: string[];
};

export type RequirementMatchDraft = {
  requirementKey: string;
  sourceField: string;
  category: CandidateMatchRequirementCategory;
  result: CandidateMatchResult;
  reasonCode: string;
  claimId: number | null;
  evidenceId: number | null;
};
