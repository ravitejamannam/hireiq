import type { CandidateEvidenceSourceType } from "@prisma/client";

export const CAPTURE_SKIP_REASON = {
  ALREADY_EXISTS: "ALREADY_EXISTS",
  NO_TEXT: "NO_TEXT",
  UNSUPPORTED_SOURCE: "UNSUPPORTED_SOURCE",
} as const;

export type EvidenceCaptureSkipReason =
  (typeof CAPTURE_SKIP_REASON)[keyof typeof CAPTURE_SKIP_REASON];

export type EvidenceCaptureSkipReasons = Partial<
  Record<EvidenceCaptureSkipReason, number>
>;

export type JobEvidenceCaptureResult = {
  jobId: number;
  companyId: number;
  captured: number;
  skipped: number;
  reasons: EvidenceCaptureSkipReasons;
};

export type RecruiterEvidenceCaptureResult = {
  evidenceId: number;
  candidateId: number;
  applicationId: number;
  companyId: number;
  sourceType: CandidateEvidenceSourceType;
  contentSha256: string;
  reused: boolean;
};

export type JobEvidenceCaptureApplicationRow = {
  applicationId: number;
  candidateId: number;
  evidenceCount: number;
  hasHostedApplyText: boolean;
};

export type JobEvidenceCapturePageData = {
  jobId: number;
  companyId: number;
  applications: JobEvidenceCaptureApplicationRow[];
};
