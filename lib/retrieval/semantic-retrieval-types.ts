import type { SemanticRetrievalRunStatus } from "@prisma/client";

export type SemanticApplicationScore = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  semanticScore: number;
  supportingEvidenceId: number | null;
};

export type SafeSemanticRetrievalResult = {
  id: number;
  companyId: number;
  runId: number;
  applicationId: number;
  candidateId: number;
  rank: number;
  semanticScore: number;
  supportingEvidenceId: number | null;
  method: string;
  createdAt: Date;
  whyRetrieved: string;
};

export type SafeSemanticRetrievalRun = {
  id: number;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number;
  status: SemanticRetrievalRunStatus;
  retrievalVersion: string;
  queryConstructionVersion: string;
  representationVersion: string;
  normalizationVersion: string;
  ontologyVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingModelVersion: string;
  embeddingDimensions: number;
  resultLimit: number;
  searchedCount: number;
  retrievedCount: number;
  queryHash: string;
  evidenceSnapshotHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  results: SafeSemanticRetrievalResult[];
};

export type SemanticRetrievalPageData = {
  jobId: number;
  publishedSpecs: Array<{ id: number; versionNumber: number; title: string }>;
  runs: SafeSemanticRetrievalRun[];
};

export type RetrievalMetricRow = {
  k: number;
  recall: number;
  precision: number;
  ndcg: number;
};

export type RetrievalComparisonReport = {
  datasetLabel: "SYNTHETIC_NOT_RECRUITER_OUTCOMES";
  m8: {
    retrievalVersion: string;
    metrics: RetrievalMetricRow[];
    mrr: number;
    retrievedIds: number[];
  };
  m9: {
    retrievalVersion: string;
    embedderLabel: string;
    metrics: RetrievalMetricRow[];
    mrr: number;
    retrievedIds: number[];
  };
  notes: string[];
};
