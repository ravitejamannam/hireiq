/**
 * Safe T89 profile DTO. No email, phone, ingestion PII, scores, or identity fields.
 */
import type {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";

export type SafeCandidateProfile = {
  candidateId: number;
  companyId: number;
  name: string;
  headline: string | null;
  location: string | null;
  experienceYears: number | null;
  skillsText: string | null;
  currentEmployer: string | null;
  expectedCTC: string | null;
  linkedInUrl: string | null;
};

export type SafeCandidateApplicationSummary = {
  id: number;
  jobId: number;
  jobTitle: string;
  status: ApplicationPipelineStatus;
  source: SourcingDatabaseSource | null;
  createdAt: Date;
};

export type CandidateProfilePageData = {
  profile: SafeCandidateProfile;
  applications: SafeCandidateApplicationSummary[];
};

export type CandidateMaterializeSource = {
  id: number;
  companyId: number;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  currentEmployer: string | null;
  expectedCTC: string | null;
};
