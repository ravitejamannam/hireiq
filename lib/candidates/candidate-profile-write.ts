import { Prisma } from "@prisma/client";

import type { CandidateProfileWriteData } from "@/lib/repositories/candidate-profile-repository";
import {
  currentEmployerFromExperiences,
  skillsTextFromProfile,
  type StructuredProfilePayload,
} from "@/lib/profiles/structured-profile";

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export function candidateProfileWriteFromStructured(input: {
  location: string | null;
  experienceYears: number | null;
  expectedCTC: string | null;
  skillsText?: string | null;
  currentEmployer?: string | null;
  headline?: string | null;
  payload: StructuredProfilePayload;
}): CandidateProfileWriteData {
  const { payload } = input;
  const skillsText =
    input.skillsText !== undefined
      ? input.skillsText
      : skillsTextFromProfile(payload);
  const roleTitle = payload.roleTitle ?? input.headline ?? null;

  return {
    headline: roleTitle,
    location: input.location,
    experienceYears: input.experienceYears,
    skillsText,
    currentEmployer:
      input.currentEmployer ??
      currentEmployerFromExperiences(payload.experiences),
    expectedCTC: input.expectedCTC,
    linkedInUrl: payload.linkedInUrl,
    aboutText: payload.aboutText,
    roleTitle,
    domains: jsonValue(payload.domains),
    githubUrl: payload.githubUrl,
    portfolioUrl: payload.portfolioUrl,
    twitterUrl: payload.twitterUrl,
    videoResumeUrl: payload.videoUrl,
    leetcodeUrl: payload.leetcodeUrl,
    socialLinks: jsonValue(payload.socialLinks),
    experiences: jsonValue(payload.experiences),
    education: jsonValue(payload.education),
    projects: jsonValue(payload.projects),
  };
}
