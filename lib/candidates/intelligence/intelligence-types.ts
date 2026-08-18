import type {
  CandidateClaimType,
  CandidateIntelligenceExtractorType,
  CandidateIntelligenceRunStatus,
} from "@prisma/client";

export type SafeCandidateClaim = {
  id: number;
  companyId: number;
  candidateId: number;
  runId: number;
  evidenceId: number;
  claimType: CandidateClaimType;
  value: string;
  normalizedValue: string | null;
  createdAt: Date;
};

export type SafeCandidateIntelligenceRun = {
  id: number;
  companyId: number;
  candidateId: number;
  evidenceId: number;
  status: CandidateIntelligenceRunStatus;
  extractorType: CandidateIntelligenceExtractorType;
  extractorVersion: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  durationMs: number | null;
  claims: SafeCandidateClaim[];
};

export type CandidateIntelligencePageData = {
  candidateId: number;
  runs: SafeCandidateIntelligenceRun[];
};

export type ExtractedClaimDraft = {
  claimType: CandidateClaimType;
  value: string;
  normalizedValue: string;
};
