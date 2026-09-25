import type {
  EvidenceGraphEdgeType,
  EvidenceGraphNodeType,
  EvidenceGraphRunStatus,
} from "@prisma/client";

export type EvidenceGraphEdgeDraft = {
  companyId: number;
  edgeType: EvidenceGraphEdgeType;
  fromType: EvidenceGraphNodeType;
  fromId: number;
  toType: EvidenceGraphNodeType;
  toId: number;
  provenance: string;
  sourceEvidenceId: number | null;
  sourceClaimId: number | null;
  sourceRequirementId: number | null;
  sourceAssessmentId: number | null;
  ontologyVersion: string | null;
  jobSpecificationVersionId: number | null;
};

export type SafeEvidenceGraphEdge = EvidenceGraphEdgeDraft & {
  id: number;
  runId: number;
  createdAt: Date;
  evidenceActive: boolean;
};

export type SafeEvidenceGraphRun = {
  id: number;
  companyId: number;
  jobId: number;
  applicationId: number;
  candidateId: number;
  jobSpecificationVersionId: number;
  jobIntelligenceRunId: number | null;
  matcherV2RunId: number | null;
  status: EvidenceGraphRunStatus;
  graphVersion: string;
  ontologyVersion: string;
  matcherVersion: string | null;
  sourceSnapshotHash: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  edges: SafeEvidenceGraphEdge[];
};

export type EvidenceGraphPageData = {
  jobId: number;
  publishedSpecs: Array<{ id: number; versionNumber: number; title: string }>;
  runs: SafeEvidenceGraphRun[];
};

export type EvidenceGraphBuildInput = {
  companyId: number;
  applicationId: number;
  candidateId: number;
  jobSpecificationVersionId: number;
  ontologyVersion: string;
  evidence: Array<{
    evidenceId: number;
    companyId: number;
    candidateId: number;
    revokedAt: Date | null;
    supersededById: number | null;
  }>;
  claims: Array<{
    claimId: number;
    companyId: number;
    candidateId: number;
    evidenceId: number;
    claimType: "SKILL" | "LOCATION" | "EMPLOYER" | "JOB_TITLE";
    normalizedValue: string | null;
    sourceSpanStart: number | null;
    sourceSpanEnd: number | null;
  }>;
  requirements: Array<{
    requirementId: number;
    companyId: number;
    jobSpecificationVersionId: number;
    skillConceptId: number | null;
    skillCanonicalKey: string | null;
  }>;
  skills: Array<{
    skillConceptId: number;
    canonicalKey: string;
    ontologyVersion: string;
  }>;
  assessments: Array<{
    assessmentId: number;
    companyId: number;
    jobRequirementId: number;
    claimId: number | null;
    evidenceId: number | null;
    supportState: string;
  }>;
  profileSkills?: string | null;
};
