import type { HybridRetrievalRunStatus } from "@prisma/client";

export type SafeHybridRetrievalResult = {
  id: number;
  companyId: number;
  runId: number;
  applicationId: number;
  candidateId: number;
  rank: number;
  rrfScore: number;
  lexicalRank: number | null;
  semanticRank: number | null;
  fusionVersion: string;
  createdAt: Date;
  whyRetrieved: string;
};

export type SafeHybridRetrievalRun = {
  id: number;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  lexicalRunId: number;
  semanticRunId: number;
  status: HybridRetrievalRunStatus;
  fusionVersion: string;
  rrfK: number;
  resultLimit: number;
  datasetVersion: string;
  lexicalRetrievalVersion: string;
  semanticRetrievalVersion: string;
  retrievedCount: number;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  results: SafeHybridRetrievalResult[];
};

export type HybridRetrievalPageData = {
  jobId: number;
  lexicalRuns: Array<{ id: number; resultLimit: number; retrievedCount: number }>;
  semanticRuns: Array<{ id: number; resultLimit: number; retrievedCount: number }>;
  runs: SafeHybridRetrievalRun[];
};

export type HybridBaselineRunView = {
  id: number;
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  retrievalVersion: string;
  resultLimit: number;
  results: Array<{
    applicationId: number;
    candidateId: number;
    companyId: number;
    rank: number;
  }>;
};
