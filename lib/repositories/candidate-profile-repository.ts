import { Prisma } from "@prisma/client";

import { profileCreateDataFromCandidate } from "@/lib/candidates/candidate-profile-from-candidate";
import type { CandidateMaterializeSource } from "@/lib/candidates/candidate-profile-types";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export const candidateProfileSelect = {
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
  aboutText: true,
  roleTitle: true,
  domains: true,
  githubUrl: true,
  portfolioUrl: true,
  twitterUrl: true,
  videoResumeUrl: true,
  leetcodeUrl: true,
  socialLinks: true,
  photoStorageKey: true,
  photoContentType: true,
  experiences: true,
  education: true,
  projects: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CandidateProfileSelect;

export type CandidateProfileRow = Prisma.CandidateProfileGetPayload<{
  select: typeof candidateProfileSelect;
}>;

export type CandidateProfileWriteData = {
  headline: string | null;
  location: string | null;
  experienceYears: number | null;
  skillsText: string | null;
  currentEmployer: string | null;
  expectedCTC: string | null;
  linkedInUrl: string | null;
  aboutText: string | null;
  roleTitle: string | null;
  domains: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  githubUrl: string | null;
  portfolioUrl: string | null;
  twitterUrl: string | null;
  videoResumeUrl: string | null;
  leetcodeUrl: string | null;
  socialLinks: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  experiences: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  education: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  projects: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

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
    select: candidateProfileSelect,
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
    select: candidateProfileSelect,
  });
}

export async function upsertProfileFromApply(
  candidateId: number,
  companyId: number,
  data: CandidateProfileWriteData,
  db: Db = prisma,
) {
  return db.candidateProfile.upsert({
    where: { candidateId },
    create: {
      candidateId,
      companyId,
      ...data,
    },
    update: data,
    select: candidateProfileSelect,
  });
}

export async function updateProfileByCandidateIdAndCompanyId(
  candidateId: number,
  companyId: number,
  data: CandidateProfileWriteData,
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
    select: candidateProfileSelect,
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
