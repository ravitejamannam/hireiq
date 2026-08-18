import { Prisma } from "@prisma/client";

import { profileCreateDataFromCandidate } from "@/lib/candidates/candidate-profile-from-candidate";
import type { CandidateMaterializeSource } from "@/lib/candidates/candidate-profile-types";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const profileSelect = {
  id: true,
  candidateId: true,
  companyId: true,
  headline: true,
  location: true,
  experienceYears: true,
  skillsText: true,
  currentEmployer: true,
  expectedCTC: true,
  linkedInUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CandidateProfileSelect;

export type CandidateProfileRow = Prisma.CandidateProfileGetPayload<{
  select: typeof profileSelect;
}>;

export async function findProfileByCandidateIdAndCompanyId(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateProfile.findFirst({
    where: {
      candidateId,
      companyId,
    },
    select: profileSelect,
  });
}

export async function findCandidateMaterializeSource(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidate.findFirst({
    where: {
      id: candidateId,
      companyId,
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      location: true,
      experienceYears: true,
      skills: true,
      currentEmployer: true,
      expectedCTC: true,
    },
  });
}

export async function createProfileFromCandidate(
  candidate: CandidateMaterializeSource,
  db: Db = prisma,
) {
  return db.candidateProfile.create({
    data: profileCreateDataFromCandidate(candidate),
    select: profileSelect,
  });
}

export async function updateProfileByCandidateIdAndCompanyId(
  candidateId: number,
  companyId: number,
  data: {
    headline: string | null;
    location: string | null;
    experienceYears: number | null;
    skillsText: string | null;
    currentEmployer: string | null;
    expectedCTC: string | null;
    linkedInUrl: string | null;
  },
  db: Db = prisma,
) {
  return db.candidateProfile.update({
    where: {
      candidateId_companyId: {
        candidateId,
        companyId,
      },
    },
    data,
    select: profileSelect,
  });
}

export async function updateCandidateDisplayName(
  candidateId: number,
  companyId: number,
  name: string,
  db: Db = prisma,
) {
  return db.candidate.update({
    where: {
      id_companyId: {
        id: candidateId,
        companyId,
      },
    },
    data: {
      name,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

export async function listApplicationsForCandidate(
  candidateId: number,
  companyId: number,
  applicationScope: Prisma.ApplicationWhereInput,
) {
  return prisma.application.findMany({
    where: {
      AND: [
        applicationScope,
        {
          candidateId,
          companyId,
        },
      ],
    },
    select: {
      id: true,
      jobId: true,
      status: true,
      source: true,
      createdAt: true,
      job: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
