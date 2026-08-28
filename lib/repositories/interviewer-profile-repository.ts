import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export const interviewerProfileSelect = {
  id: true,
  interviewerId: true,
  headline: true,
  location: true,
  aboutText: true,
  roleTitle: true,
  experienceYears: true,
  domains: true,
  linkedInUrl: true,
  githubUrl: true,
  portfolioUrl: true,
  twitterUrl: true,
  videoUrl: true,
  leetcodeUrl: true,
  socialLinks: true,
  experiences: true,
  education: true,
  projects: true,
} satisfies Prisma.InterviewerProfileSelect;

export type InterviewerProfileRow = Prisma.InterviewerProfileGetPayload<{
  select: typeof interviewerProfileSelect;
}>;

export async function findInterviewerProfile(interviewerId: number, db: Db = prisma) {
  return db.interviewerProfile.findUnique({
    where: { interviewerId },
    select: interviewerProfileSelect,
  });
}

export async function upsertInterviewerProfile(
  interviewerId: number,
  data: {
    headline: string | null;
    location: string | null;
    aboutText: string | null;
    roleTitle: string | null;
    experienceYears: number | null;
    domains: Prisma.InputJsonValue;
    linkedInUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
    twitterUrl: string | null;
    videoUrl: string | null;
    leetcodeUrl: string | null;
    socialLinks: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    experiences: Prisma.InputJsonValue;
    education: Prisma.InputJsonValue;
    projects: Prisma.InputJsonValue;
  },
  db: Db = prisma,
) {
  return db.interviewerProfile.upsert({
    where: { interviewerId },
    create: { interviewerId, ...data },
    update: data,
    select: interviewerProfileSelect,
  });
}
