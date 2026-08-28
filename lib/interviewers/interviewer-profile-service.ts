import { AuthorizationError, requireInterviewerPortal } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { fetchGithubProof } from "@/lib/profiles/github-public";
import type { GithubProofSnapshot } from "@/lib/profiles/github-public";
import { fetchLeetcodeProof } from "@/lib/profiles/leetcode-public";
import type { LeetcodeProofSnapshot } from "@/lib/profiles/leetcode-public";
import {
  collectStructuredProfile,
  isPersonProfilePublished,
  parseStoredStructuredProfile,
  type StructuredProfilePayload,
} from "@/lib/profiles/structured-profile";
import { getInterviewerById } from "@/lib/repositories/interviewer-repository";
import {
  findInterviewerProfile,
  upsertInterviewerProfile,
  type InterviewerProfileRow,
} from "@/lib/repositories/interviewer-profile-repository";
import { Prisma } from "@prisma/client";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NAME_MAX = 200;
const LOCATION_MAX = 200;

export class InterviewerProfileValidationError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Profile details are invalid.");
    this.name = "InterviewerProfileValidationError";
    this.fields = fields;
  }
}

export type SafeInterviewerProfile = {
  interviewerId: number;
  name: string;
  category: string;
  location: string | null;
  experienceYears: number | null;
  profile: StructuredProfilePayload;
  githubProof: GithubProofSnapshot | null;
  leetcodeProof: LeetcodeProofSnapshot | null;
};

function optionalBounded(value: unknown, field: string, max: number, fields: Record<string, string>) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    fields[field] = `${field} is invalid.`;
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    fields[field] = `${field} is too long.`;
    return null;
  }
  if (CONTROL_CHARS.test(trimmed)) {
    fields[field] = `${field} contains invalid characters.`;
    return null;
  }
  return trimmed;
}

function optionalYears(value: unknown, fields: Record<string, string>) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 80) {
    fields.experienceYears = "Years of experience is invalid.";
    return null;
  }
  return parsed;
}

async function composeSafeProfile(
  interviewer: { id: number; name: string; category: string },
  row: InterviewerProfileRow | null,
): Promise<SafeInterviewerProfile> {
  const profile = parseStoredStructuredProfile(
    row
      ? {
          roleTitle: row.roleTitle ?? row.headline,
          aboutText: row.aboutText,
          domains: row.domains,
          videoUrl: row.videoUrl,
          githubUrl: row.githubUrl,
          portfolioUrl: row.portfolioUrl,
          twitterUrl: row.twitterUrl,
          linkedInUrl: row.linkedInUrl,
          leetcodeUrl: row.leetcodeUrl,
          socialLinks: row.socialLinks,
          experiences: row.experiences,
          education: row.education,
          projects: row.projects,
        }
      : {},
  );
  const [githubProof, leetcodeProof] = await Promise.all([
    fetchGithubProof(profile.githubUrl),
    fetchLeetcodeProof(profile.leetcodeUrl),
  ]);
  return {
    interviewerId: interviewer.id,
    name: interviewer.name,
    category: interviewer.category,
    location: row?.location ?? null,
    experienceYears: row?.experienceYears ?? null,
    profile,
    githubProof,
    leetcodeProof,
  };
}

export async function loadSafeInterviewerProfileById(
  interviewerId: number,
): Promise<SafeInterviewerProfile | null> {
  const interviewer = await prisma.interviewer.findUnique({
    where: { id: interviewerId },
    select: { id: true, name: true, category: true },
  });
  if (!interviewer) return null;
  const row = await findInterviewerProfile(interviewerId);
  return composeSafeProfile(interviewer, row);
}

export function interviewerProfileIsPublished(profile: SafeInterviewerProfile) {
  return isPersonProfilePublished({
    roleTitle: profile.profile.roleTitle,
    aboutText: profile.profile.aboutText,
    experiences: profile.profile.experiences,
    education: profile.profile.education,
    githubUrl: profile.profile.githubUrl,
    linkedInUrl: profile.profile.linkedInUrl,
    leetcodeUrl: profile.profile.leetcodeUrl,
  });
}

export async function getInterviewerOwnProfile(): Promise<SafeInterviewerProfile> {
  const portal = await requireInterviewerPortal();
  const loaded = await loadSafeInterviewerProfileById(portal.interviewerId);
  if (!loaded) {
    throw new AuthorizationError("Resource not found.");
  }
  return loaded;
}

/** Admin: any interviewer. Client: only interviewers assigned to their jobs. */
export async function getInterviewerProfileForViewer(interviewerId: number) {
  const scoped = await getInterviewerById(interviewerId);
  if (!scoped) return null;
  return loadSafeInterviewerProfileById(interviewerId);
}

export async function updateInterviewerOwnProfile(input: unknown): Promise<SafeInterviewerProfile> {
  const portal = await requireInterviewerPortal();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InterviewerProfileValidationError({ form: "Profile details are invalid." });
  }
  const record = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const name = optionalBounded(record.name, "name", NAME_MAX, fields);
  if (!name) fields.name = fields.name ?? "Name is required.";
  const location = optionalBounded(record.location, "location", LOCATION_MAX, fields);
  const experienceYears = optionalYears(record.experienceYears, fields);
  const profile = collectStructuredProfile(record, fields);
  if (Object.keys(fields).length > 0) {
    throw new InterviewerProfileValidationError(fields);
  }

  await prisma.$transaction(async (tx) => {
    await tx.interviewer.update({
      where: { id: portal.interviewerId },
      data: { name: name! },
    });
    await upsertInterviewerProfile(
      portal.interviewerId,
      {
        headline: profile.roleTitle,
        location,
        aboutText: profile.aboutText,
        roleTitle: profile.roleTitle,
        experienceYears,
        domains: profile.domains as Prisma.InputJsonValue,
        linkedInUrl: profile.linkedInUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        twitterUrl: profile.twitterUrl,
        videoUrl: profile.videoUrl,
        leetcodeUrl: profile.leetcodeUrl,
        socialLinks: profile.socialLinks.length
          ? (profile.socialLinks as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        experiences: profile.experiences as Prisma.InputJsonValue,
        education: profile.education as Prisma.InputJsonValue,
        projects: profile.projects as Prisma.InputJsonValue,
      },
      tx,
    );
  });

  return getInterviewerOwnProfile();
}

export function isInterviewerProfileUserError(
  error: unknown,
): error is InterviewerProfileValidationError | AuthorizationError {
  return (
    error instanceof InterviewerProfileValidationError ||
    error instanceof AuthorizationError
  );
}
