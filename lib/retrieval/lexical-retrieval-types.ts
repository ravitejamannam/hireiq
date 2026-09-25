import type { JobRequirementCategory, LexicalRetrievalRunStatus } from "@prisma/client";

export type LexicalQueryTerm = {
  key: string;
  kind: "SKILL" | "LOCATION";
  sourceText: string;
  category: JobRequirementCategory;
};

export type LexicalQuery = {
  terms: LexicalQueryTerm[];
};

export type LexicalEvidenceDocument = {
  evidenceId: number;
  applicationId: number | null;
  candidateId: number;
  companyId: number;
  inlineText: string | null;
  contentSha256: string | null;
  revokedAt: Date | null;
  supersededById: number | null;
};

export type LexicalApplicationDocument = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  jobId: number;
  evidence: LexicalEvidenceDocument[];
};

export type LexicalApplicationScore = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  lexicalScore: number;
  matchedTerms: string[];
};

export type SafeLexicalRetrievalResult = {
  id: number;
  companyId: number;
  runId: number;
  applicationId: number;
  candidateId: number;
  rank: number;
  lexicalScore: number;
  matchedTerms: string[];
  method: string;
  createdAt: Date;
  whyRetrieved: string;
};

export type SafeLexicalRetrievalRun = {
  id: number;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number;
  status: LexicalRetrievalRunStatus;
  retrievalVersion: string;
  queryConstructionVersion: string;
  normalizationVersion: string;
  ontologyVersion: string;
  resultLimit: number;
  searchedCount: number;
  retrievedCount: number;
  queryHash: string;
  evidenceSnapshotHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  results: SafeLexicalRetrievalResult[];
};

export type LexicalRetrievalPageData = {
  jobId: number;
  publishedSpecs: Array<{ id: number; versionNumber: number; title: string }>;
  runs: SafeLexicalRetrievalRun[];
};

export type RetrievalRelevanceLabel =
  | "NOT_RELEVANT"
  | "POSSIBLY_RELEVANT"
  | "RELEVANT"
  | "STRONGLY_RELEVANT";

export type SyntheticRetrievalJudgment = {
  datasetLabel: "SYNTHETIC_NOT_RECRUITER_OUTCOMES";
  applicationId: number;
  label: RetrievalRelevanceLabel;
};
