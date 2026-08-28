/**
 * Safe T89 profile DTO. No email, phone, ingestion PII, scores, or identity fields.
 */
import type {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";
import type {
  ProfileEducation,
  ProfileExperience,
  ProfileProject,
} from "@/lib/profiles/structured-profile";
import type { ProfileSocialLink } from "@/lib/profiles/social-platforms";
import type { GithubProofSnapshot } from "@/lib/profiles/github-public";
import type { LeetcodeProofSnapshot } from "@/lib/profiles/leetcode-public";

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
  aboutText: string | null;
  roleTitle: string | null;
  domains: string[];
  githubUrl: string | null;
  portfolioUrl: string | null;
  twitterUrl: string | null;
  videoResumeUrl: string | null;
  leetcodeUrl: string | null;
  socialLinks: ProfileSocialLink[];
  hasPhoto: boolean;
  photoUrl: string | null;
  githubProof: GithubProofSnapshot | null;
  leetcodeProof: LeetcodeProofSnapshot | null;
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
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
