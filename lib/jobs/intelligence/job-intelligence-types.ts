import type {
  JobIntelligenceExtractorType,
  JobIntelligenceRunStatus,
  JobRequirementCategory,
  JobRequirementUncertainty,
} from "@prisma/client";

export type SpecExtractionInput = {
  title: string;
  primarySkills: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  location: string | null;
  experienceRange: string | null;
  jobDescription: string | null;
  evaluationCriteria: string | null;
};

export type RequirementDraft = {
  stableKey: string;
  sourceField: string;
  sourceText: string;
  sourceSpanStart: number | null;
  sourceSpanEnd: number | null;
  category: JobRequirementCategory;
  normalizedValue: string | null;
  skillCanonicalKey: string | null;
  provenance: string;
  uncertainty: JobRequirementUncertainty;
};

export type SafeJobRequirement = {
  id: number;
  companyId: number;
  runId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  stableKey: string;
  sourceField: string;
  sourceText: string;
  sourceSpanStart: number | null;
  sourceSpanEnd: number | null;
  category: JobRequirementCategory;
  normalizedValue: string | null;
  skillConceptId: number | null;
  provenance: string;
  uncertainty: JobRequirementUncertainty;
  createdAt: Date;
};

export type SafeJobIntelligenceRun = {
  id: number;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  status: JobIntelligenceRunStatus;
  extractorType: JobIntelligenceExtractorType;
  extractorVersion: string;
  inputHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  requirements: SafeJobRequirement[];
};

export type JobIntelligencePageData = {
  jobId: number;
  publishedSpecs: Array<{
    id: number;
    versionNumber: number;
    title: string;
  }>;
  runs: SafeJobIntelligenceRun[];
};
