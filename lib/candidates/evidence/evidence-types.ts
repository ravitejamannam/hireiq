import type {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
} from "@prisma/client";

export type SafeCandidateEvidence = {
  id: number;
  companyId: number;
  candidateId: number;
  applicationId: number | null;
  jobTitle: string | null;
  sourceType: CandidateEvidenceSourceType;
  origin: CandidateEvidenceOrigin;
  ingestionEventId: number | null;
  hostedApplySubmissionId: number | null;
  inlineText: string | null;
  contentSha256: string | null;
  supersededById: number | null;
  revokedAt: Date | null;
  createdAt: Date;
  isRevoked: boolean;
  isSuperseded: boolean;
};

