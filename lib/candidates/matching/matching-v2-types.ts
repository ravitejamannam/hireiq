import type {
  JobRequirementCategory,
  JobRequirementUncertainty,
  RequirementAssessmentRunStatus,
  RequirementSupportState,
} from "@prisma/client";

export type MatcherV2Claim = {
  id: number;
  evidenceId: number;
  runId: number;
  claimType: "SKILL" | "LOCATION";
  normalizedValue: string;
  polarity: "POSITIVE" | "NEGATED" | "UNCERTAIN";
  viaAlias: boolean;
};

export type MatcherV2Requirement = {
  id: number;
  stableKey: string;
  sourceField: string;
  sourceText: string;
  category: JobRequirementCategory;
  normalizedValue: string | null;
  skillCanonicalKey: string | null;
  uncertainty: JobRequirementUncertainty;
};

export type RequirementAssessmentDraft = {
  jobRequirementId: number;
  supportState: RequirementSupportState;
  method: string;
  reasonCode: string;
  claimId: number | null;
  evidenceId: number | null;
};

export type SafeRequirementAssessment = {
  id: number;
  companyId: number;
  runId: number;
  applicationId: number;
  candidateId: number;
  jobRequirementId: number;
  supportState: RequirementSupportState;
  method: string;
  reasonCode: string;
  claimId: number | null;
  evidenceId: number | null;
  createdAt: Date;
  why: string;
  gap: string | null;
  uncertainty: string | null;
  evidenceSummary: string | null;
};

export type SafeRequirementAssessmentRun = {
  id: number;
  companyId: number;
  applicationId: number;
  candidateId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number;
  status: RequirementAssessmentRunStatus;
  matcherVersion: string;
  ontologyVersion: string;
  intelligenceSnapshotHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  assessments: SafeRequirementAssessment[];
};

export type RequirementExplanationPageData = {
  jobId: number;
  jobIntelligence: {
    runId: number;
    jobSpecificationVersionId: number;
    extractorVersion: string;
    requirements: Array<{
      id: number;
      sourceField: string;
      sourceText: string;
      category: JobRequirementCategory;
      uncertainty: JobRequirementUncertainty;
      normalizedValue: string | null;
    }>;
  } | null;
  publishedSpecs: Array<{ id: number; versionNumber: number; title: string }>;
  applications: Array<{
    applicationId: number;
    candidateId: number;
    candidateName: string;
    run: SafeRequirementAssessmentRun | null;
  }>;
};
