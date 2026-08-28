import { PortalRole } from "@prisma/client";

import {
  AuthorizationError,
  applicationScopeWhere,
  requireCandidateAccess,
} from "@/lib/auth/authorization";
import type {
  CandidateProfilePageData,
  SafeCandidateProfile,
} from "@/lib/candidates/candidate-profile-types";
import { prisma } from "@/lib/prisma";
import {
  createProfileFromCandidate,
  findCandidateMaterializeSource,
  findProfileByCandidateIdAndCompanyId,
  listApplicationsForCandidate,
  updateCandidateDisplayName,
  updateProfileByCandidateIdAndCompanyId,
  type CandidateProfileRow,
} from "@/lib/repositories/candidate-profile-repository";
import { candidateProfileWriteFromStructured } from "@/lib/candidates/candidate-profile-write";
import { parseStoredStructuredProfile } from "@/lib/profiles/structured-profile";
import { fetchGithubProof } from "@/lib/profiles/github-public";
import { fetchLeetcodeProof } from "@/lib/profiles/leetcode-public";
import {
  CandidateProfileValidationError,
  validateCandidateId,
  validateCandidateProfileUpdate,
} from "@/lib/validation/candidate-profile-validation";
import { getPrismaErrorCode } from "@/lib/prisma-error";

function toSafeProfile(
  name: string,
  row: CandidateProfileRow,
  proof?: {
    githubProof: SafeCandidateProfile["githubProof"];
    leetcodeProof: SafeCandidateProfile["leetcodeProof"];
  },
): SafeCandidateProfile {
  const structured = parseStoredStructuredProfile({
    roleTitle: row.roleTitle,
    aboutText: row.aboutText,
    domains: row.domains,
    videoUrl: row.videoResumeUrl,
    githubUrl: row.githubUrl,
    portfolioUrl: row.portfolioUrl,
    twitterUrl: row.twitterUrl,
    linkedInUrl: row.linkedInUrl,
    leetcodeUrl: row.leetcodeUrl,
    socialLinks: row.socialLinks,
    experiences: row.experiences,
    education: row.education,
    projects: row.projects,
  });
  const hasPhoto = Boolean(row.photoStorageKey);

  return {
    candidateId: row.candidateId,
    companyId: row.companyId,
    name,
    headline: row.headline ?? structured.roleTitle,
    location: row.location,
    experienceYears: row.experienceYears,
    skillsText: row.skillsText,
    currentEmployer: row.currentEmployer,
    expectedCTC: row.expectedCTC,
    linkedInUrl: row.linkedInUrl,
    aboutText: structured.aboutText,
    roleTitle: structured.roleTitle,
    domains: structured.domains,
    githubUrl: structured.githubUrl,
    portfolioUrl: structured.portfolioUrl,
    twitterUrl: structured.twitterUrl,
    videoResumeUrl: structured.videoUrl,
    leetcodeUrl: structured.leetcodeUrl,
    socialLinks: structured.socialLinks,
    hasPhoto,
    photoUrl: hasPhoto
      ? `/api/candidates/${row.candidateId}/photo`
      : null,
    githubProof: proof?.githubProof ?? null,
    leetcodeProof: proof?.leetcodeProof ?? null,
    experiences: structured.experiences,
    education: structured.education,
    projects: structured.projects,
  };
}

async function withProof(profile: SafeCandidateProfile): Promise<SafeCandidateProfile> {
  const [githubProof, leetcodeProof] = await Promise.all([
    fetchGithubProof(profile.githubUrl),
    fetchLeetcodeProof(profile.leetcodeUrl),
  ]);
  return { ...profile, githubProof, leetcodeProof };
}

async function materializeProfile(candidateId: number, companyId: number) {
  const existing = await findProfileByCandidateIdAndCompanyId(
    candidateId,
    companyId,
  );
  if (existing) {
    const candidate = await findCandidateMaterializeSource(
      candidateId,
      companyId,
    );
    if (!candidate) {
      throw new AuthorizationError("Resource not found.");
    }
    return { row: existing, name: candidate.name };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const candidate = await findCandidateMaterializeSource(
        candidateId,
        companyId,
        tx,
      );
      if (!candidate) {
        throw new AuthorizationError("Resource not found.");
      }

      const locked = await tx.candidate.findFirst({
        where: { id: candidateId, companyId },
        select: { id: true },
      });
      if (!locked) {
        throw new AuthorizationError("Resource not found.");
      }

      const raced = await findProfileByCandidateIdAndCompanyId(
        candidateId,
        companyId,
        tx,
      );
      if (raced) {
        return { row: raced, name: candidate.name };
      }

      const row = await createProfileFromCandidate(candidate, tx);
      return { row, name: candidate.name };
    });

    return created;
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      const raced = await findProfileByCandidateIdAndCompanyId(
        candidateId,
        companyId,
      );
      const candidate = await findCandidateMaterializeSource(
        candidateId,
        companyId,
      );
      if (!raced || !candidate) {
        throw new AuthorizationError("Resource not found.");
      }
      return { row: raced, name: candidate.name };
    }

    throw error;
  }
}

export async function getOrMaterializeCandidateProfile(
  candidateIdInput: unknown,
): Promise<SafeCandidateProfile> {
  const candidateId = validateCandidateId(candidateIdInput);
  const { candidate } = await requireCandidateAccess(candidateId);
  const materialized = await materializeProfile(
    candidate.id,
    candidate.companyId,
  );
  return withProof(toSafeProfile(materialized.name, materialized.row));
}

export async function getCandidateProfilePageData(
  candidateIdInput: unknown,
): Promise<CandidateProfilePageData> {
  const candidateId = validateCandidateId(candidateIdInput);
  const { user, candidate } = await requireCandidateAccess(candidateId);
  const materialized = await materializeProfile(
    candidate.id,
    candidate.companyId,
  );
  const profile = await withProof(
    toSafeProfile(materialized.name, materialized.row),
  );
  const applications = await listApplicationsForCandidate(
    profile.candidateId,
    profile.companyId,
    applicationScopeWhere(user),
  );

  return {
    profile,
    applications: applications.map((application) => ({
      id: application.id,
      jobId: application.jobId,
      jobTitle: application.job.title,
      status: application.status,
      source: application.source,
      createdAt: application.createdAt,
    })),
  };
}

export async function updateCandidateProfileForAdmin(
  candidateIdInput: unknown,
  input: unknown,
): Promise<SafeCandidateProfile> {
  const candidateId = validateCandidateId(candidateIdInput);
  const { user, candidate } = await requireCandidateAccess(candidateId);

  if (user.role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }

  const validated = validateCandidateProfileUpdate(input);
  await materializeProfile(candidate.id, candidate.companyId);

  const updated = await prisma.$transaction(async (tx) => {
    if (validated.name) {
      await updateCandidateDisplayName(
        candidate.id,
        candidate.companyId,
        validated.name,
        tx,
      );
    }

    const row = await updateProfileByCandidateIdAndCompanyId(
      candidate.id,
      candidate.companyId,
      candidateProfileWriteFromStructured({
        location: validated.location,
        experienceYears: validated.experienceYears,
        expectedCTC: validated.expectedCTC,
        skillsText: validated.skillsText,
        currentEmployer: validated.currentEmployer,
        headline: validated.headline,
        payload: validated.profile,
      }),
      tx,
    );

    const nameRow = await findCandidateMaterializeSource(
      candidate.id,
      candidate.companyId,
      tx,
    );
    if (!nameRow) {
      throw new AuthorizationError("Resource not found.");
    }

    return withProof(toSafeProfile(nameRow.name, row));
  });

  return updated;
}

export function isCandidateProfileUserError(
  error: unknown,
): error is CandidateProfileValidationError | AuthorizationError {
  return (
    error instanceof CandidateProfileValidationError ||
    error instanceof AuthorizationError
  );
}
