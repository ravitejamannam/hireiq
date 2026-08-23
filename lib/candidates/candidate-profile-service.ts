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
import {
  CandidateProfileValidationError,
  validateCandidateId,
  validateCandidateProfileUpdate,
} from "@/lib/validation/candidate-profile-validation";
import { getPrismaErrorCode } from "@/lib/prisma-error";

function toSafeProfile(
  name: string,
  row: CandidateProfileRow,
): SafeCandidateProfile {
  return {
    candidateId: row.candidateId,
    companyId: row.companyId,
    name,
    headline: row.headline,
    location: row.location,
    experienceYears: row.experienceYears,
    skillsText: row.skillsText,
    currentEmployer: row.currentEmployer,
    expectedCTC: row.expectedCTC,
    linkedInUrl: row.linkedInUrl,
  };
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
  return toSafeProfile(materialized.name, materialized.row);
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
  const profile = toSafeProfile(materialized.name, materialized.row);
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
      {
        headline: validated.headline,
        location: validated.location,
        experienceYears: validated.experienceYears,
        skillsText: validated.skillsText,
        currentEmployer: validated.currentEmployer,
        expectedCTC: validated.expectedCTC,
        linkedInUrl: validated.linkedInUrl,
      },
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

    return toSafeProfile(nameRow.name, row);
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
