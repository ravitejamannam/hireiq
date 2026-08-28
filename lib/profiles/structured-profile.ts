/**
 * Shared descriptive career-profile payload.
 *
 * Used by hosted apply (auto-materialized onto CandidateProfile) and by
 * interviewer portal (manual InterviewerProfile). Not identity, not
 * evidence, not a match/rank score.
 */

import type { ProfileSocialLink, SocialPlatformId } from "@/lib/profiles/social-platforms";
import {
  canonicalSocialsFromLinks,
  isSocialPlatformId,
} from "@/lib/profiles/social-platforms";

export const PROFILE_DOMAINS = [
  "Engineering",
  "Research",
  "Data Science",
  "Design",
  "Product",
  "Creative",
  "Growth",
  "Marketing",
  "Operations",
  "Sales",
  "Finance",
  "People",
] as const;

export type ProfileDomain = (typeof PROFILE_DOMAINS)[number];

export const STRUCTURED_PROFILE_LIMITS = {
  roleTitle: 120,
  aboutText: 2000,
  videoUrl: 2048,
  socialUrl: 2048,
  domainMax: 3,
  listMax: 8,
  title: 160,
  company: 160,
  school: 160,
  degree: 160,
  field: 160,
  dates: 40,
  location: 120,
  summary: 2000,
  technologies: 240,
  projectName: 160,
  socialListMax: 16,
} as const;

export type ProfileExperience = {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  location: string;
  summary: string;
};

export type ProfileEducation = {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  summary: string;
};

export type ProfileProject = {
  name: string;
  url: string;
  technologies: string;
  summary: string;
};

export type StructuredProfilePayload = {
  roleTitle: string | null;
  aboutText: string | null;
  domains: string[];
  videoUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  twitterUrl: string | null;
  linkedInUrl: string | null;
  leetcodeUrl: string | null;
  socialLinks: ProfileSocialLink[];
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
};

export type StructuredProfileDraft = {
  roleTitle: string;
  aboutText: string;
  domains: string[];
  videoUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  twitterUrl: string;
  linkedInUrl: string;
  leetcodeUrl: string;
  socialLinks: ProfileSocialLink[];
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const DOMAIN_SET = new Set<string>(PROFILE_DOMAINS);

export function emptyExperience(): ProfileExperience {
  return {
    title: "",
    company: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    location: "",
    summary: "",
  };
}

export function emptyEducation(): ProfileEducation {
  return {
    school: "",
    degree: "",
    field: "",
    startDate: "",
    endDate: "",
    summary: "",
  };
}

export function emptyProject(): ProfileProject {
  return {
    name: "",
    url: "",
    technologies: "",
    summary: "",
  };
}

export function emptyStructuredDraft(): StructuredProfileDraft {
  return {
    roleTitle: "",
    aboutText: "",
    domains: [],
    videoUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    twitterUrl: "",
    linkedInUrl: "",
    leetcodeUrl: "",
    socialLinks: [],
    experiences: [emptyExperience()],
    education: [emptyEducation()],
    projects: [emptyProject()],
  };
}

export function draftFromPayload(
  payload: StructuredProfilePayload | null | undefined,
): StructuredProfileDraft {
  const base = emptyStructuredDraft();
  if (!payload) return base;
  return {
    roleTitle: payload.roleTitle ?? "",
    aboutText: payload.aboutText ?? "",
    domains: payload.domains.slice(0, STRUCTURED_PROFILE_LIMITS.domainMax),
    videoUrl: payload.videoUrl ?? "",
    githubUrl: payload.githubUrl ?? "",
    portfolioUrl: payload.portfolioUrl ?? "",
    twitterUrl: payload.twitterUrl ?? "",
    linkedInUrl: payload.linkedInUrl ?? "",
    leetcodeUrl: payload.leetcodeUrl ?? "",
    socialLinks: payload.socialLinks ?? [],
    experiences:
      payload.experiences.length > 0
        ? payload.experiences
        : [emptyExperience()],
    education:
      payload.education.length > 0 ? payload.education : [emptyEducation()],
    projects: payload.projects.length > 0 ? payload.projects : [emptyProject()],
  };
}

function optionalTrimmed(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function boundedString(
  value: unknown,
  field: string,
  max: number,
  fields: Record<string, string>,
): string | null {
  const raw = optionalTrimmed(value);
  if (raw === undefined) {
    fields[field] = `${field} is invalid.`;
    return null;
  }
  if (!raw) return null;
  if (raw.length > max) {
    fields[field] = `${field} is too long.`;
    return null;
  }
  if (CONTROL_CHARS.test(raw)) {
    fields[field] = `${field} contains invalid characters.`;
    return null;
  }
  return raw;
}

function optionalHttpUrl(
  value: unknown,
  field: string,
  max: number,
  fields: Record<string, string>,
): string | null {
  const trimmed = boundedString(value, field, max, fields);
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    fields[field] = `${field} is invalid.`;
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fields[field] = `${field} must use http or https.`;
    return null;
  }

  return trimmed;
}

function isBlankExperience(row: ProfileExperience) {
  return (
    !row.title &&
    !row.company &&
    !row.startDate &&
    !row.endDate &&
    !row.location &&
    !row.summary &&
    !row.isCurrent
  );
}

function isBlankEducation(row: ProfileEducation) {
  return (
    !row.school &&
    !row.degree &&
    !row.field &&
    !row.startDate &&
    !row.endDate &&
    !row.summary
  );
}

function isBlankProject(row: ProfileProject) {
  return !row.name && !row.url && !row.technologies && !row.summary;
}

export function collectStructuredProfile(
  record: Record<string, unknown>,
  fields: Record<string, string>,
): StructuredProfilePayload {
  const roleTitle = boundedString(
    record.roleTitle,
    "roleTitle",
    STRUCTURED_PROFILE_LIMITS.roleTitle,
    fields,
  );
  const aboutText = boundedString(
    record.aboutText,
    "aboutText",
    STRUCTURED_PROFILE_LIMITS.aboutText,
    fields,
  );
  const videoUrl = optionalHttpUrl(
    record.videoUrl ?? record.videoResumeUrl,
    "videoUrl",
    STRUCTURED_PROFILE_LIMITS.videoUrl,
    fields,
  );
  const githubUrl = optionalHttpUrl(
    record.githubUrl,
    "githubUrl",
    STRUCTURED_PROFILE_LIMITS.socialUrl,
    fields,
  );
  const portfolioUrl = optionalHttpUrl(
    record.portfolioUrl,
    "portfolioUrl",
    STRUCTURED_PROFILE_LIMITS.socialUrl,
    fields,
  );
  const twitterUrl = optionalHttpUrl(
    record.twitterUrl,
    "twitterUrl",
    STRUCTURED_PROFILE_LIMITS.socialUrl,
    fields,
  );
  const linkedInUrl = optionalHttpUrl(
    record.linkedInUrl,
    "linkedInUrl",
    STRUCTURED_PROFILE_LIMITS.socialUrl,
    fields,
  );
  const leetcodeUrl = optionalHttpUrl(
    record.leetcodeUrl,
    "leetcodeUrl",
    STRUCTURED_PROFILE_LIMITS.socialUrl,
    fields,
  );
  const socialLinks = parseSocialLinkList(record.socialLinks, fields);
  const fromLinks = canonicalSocialsFromLinks(socialLinks);

  const domains: string[] = [];
  if (record.domains !== undefined && record.domains !== null) {
    if (!Array.isArray(record.domains)) {
      fields.domains = "Domains are invalid.";
    } else if (record.domains.length > STRUCTURED_PROFILE_LIMITS.domainMax) {
      fields.domains = `Pick up to ${STRUCTURED_PROFILE_LIMITS.domainMax} domains.`;
    } else {
      for (const item of record.domains) {
        if (typeof item !== "string" || !DOMAIN_SET.has(item.trim())) {
          fields.domains = "One or more domains are invalid.";
          break;
        }
        const domain = item.trim();
        if (!domains.includes(domain)) {
          domains.push(domain);
        }
      }
    }
  }

  const experiences = parseExperienceList(record.experiences, fields);
  const education = parseEducationList(record.education, fields);
  const projects = parseProjectList(record.projects, fields);

  return {
    roleTitle,
    aboutText,
    domains,
    videoUrl,
    githubUrl: githubUrl ?? fromLinks.githubUrl,
    portfolioUrl: portfolioUrl ?? fromLinks.portfolioUrl,
    twitterUrl: twitterUrl ?? fromLinks.twitterUrl,
    linkedInUrl: linkedInUrl ?? fromLinks.linkedInUrl,
    leetcodeUrl: leetcodeUrl ?? fromLinks.leetcodeUrl,
    socialLinks: fromLinks.extra,
    experiences,
    education,
    projects,
  };
}

function parseSocialLinkList(
  value: unknown,
  fields: Record<string, string>,
): ProfileSocialLink[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (!Array.isArray(value)) {
    fields.socialLinks = "Social links are invalid.";
    return [];
  }
  if (value.length > STRUCTURED_PROFILE_LIMITS.socialListMax) {
    fields.socialLinks = `Add at most ${STRUCTURED_PROFILE_LIMITS.socialListMax} social links.`;
    return [];
  }

  const rows: ProfileSocialLink[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fields[`socialLinks.${index}`] = "Social link is invalid.";
      return;
    }
    const record = item as Record<string, unknown>;
    const platformRaw =
      typeof record.platform === "string" ? record.platform.trim() : "";
    if (!isSocialPlatformId(platformRaw)) {
      fields[`socialLinks.${index}`] = "Choose a social platform.";
      return;
    }
    const url = optionalHttpUrl(
      record.url,
      `socialLinks.${index}.url`,
      STRUCTURED_PROFILE_LIMITS.socialUrl,
      fields,
    );
    if (!url) {
      return;
    }
    rows.push({ platform: platformRaw as SocialPlatformId, url });
  });
  return rows;
}

function parseExperienceList(
  value: unknown,
  fields: Record<string, string>,
): ProfileExperience[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (!Array.isArray(value)) {
    fields.experiences = "Experience is invalid.";
    return [];
  }
  if (value.length > STRUCTURED_PROFILE_LIMITS.listMax) {
    fields.experiences = `Add at most ${STRUCTURED_PROFILE_LIMITS.listMax} experience entries.`;
    return [];
  }

  const rows: ProfileExperience[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fields[`experiences.${index}`] = "Experience entry is invalid.";
      return;
    }
    const record = item as Record<string, unknown>;
    const row: ProfileExperience = {
      title:
        boundedString(
          record.title,
          `experiences.${index}.title`,
          STRUCTURED_PROFILE_LIMITS.title,
          fields,
        ) ?? "",
      company:
        boundedString(
          record.company,
          `experiences.${index}.company`,
          STRUCTURED_PROFILE_LIMITS.company,
          fields,
        ) ?? "",
      startDate:
        boundedString(
          record.startDate,
          `experiences.${index}.startDate`,
          STRUCTURED_PROFILE_LIMITS.dates,
          fields,
        ) ?? "",
      endDate:
        boundedString(
          record.endDate,
          `experiences.${index}.endDate`,
          STRUCTURED_PROFILE_LIMITS.dates,
          fields,
        ) ?? "",
      isCurrent: record.isCurrent === true,
      location:
        boundedString(
          record.location,
          `experiences.${index}.location`,
          STRUCTURED_PROFILE_LIMITS.location,
          fields,
        ) ?? "",
      summary:
        boundedString(
          record.summary,
          `experiences.${index}.summary`,
          STRUCTURED_PROFILE_LIMITS.summary,
          fields,
        ) ?? "",
    };
    if (!isBlankExperience(row)) {
      if (!row.title || !row.company) {
        fields[`experiences.${index}`] =
          "Role and company are required for each experience.";
      }
      rows.push(row);
    }
  });
  return rows;
}

function parseEducationList(
  value: unknown,
  fields: Record<string, string>,
): ProfileEducation[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (!Array.isArray(value)) {
    fields.education = "Education is invalid.";
    return [];
  }
  if (value.length > STRUCTURED_PROFILE_LIMITS.listMax) {
    fields.education = `Add at most ${STRUCTURED_PROFILE_LIMITS.listMax} education entries.`;
    return [];
  }

  const rows: ProfileEducation[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fields[`education.${index}`] = "Education entry is invalid.";
      return;
    }
    const record = item as Record<string, unknown>;
    const row: ProfileEducation = {
      school:
        boundedString(
          record.school,
          `education.${index}.school`,
          STRUCTURED_PROFILE_LIMITS.school,
          fields,
        ) ?? "",
      degree:
        boundedString(
          record.degree,
          `education.${index}.degree`,
          STRUCTURED_PROFILE_LIMITS.degree,
          fields,
        ) ?? "",
      field:
        boundedString(
          record.field,
          `education.${index}.field`,
          STRUCTURED_PROFILE_LIMITS.field,
          fields,
        ) ?? "",
      startDate:
        boundedString(
          record.startDate,
          `education.${index}.startDate`,
          STRUCTURED_PROFILE_LIMITS.dates,
          fields,
        ) ?? "",
      endDate:
        boundedString(
          record.endDate,
          `education.${index}.endDate`,
          STRUCTURED_PROFILE_LIMITS.dates,
          fields,
        ) ?? "",
      summary:
        boundedString(
          record.summary,
          `education.${index}.summary`,
          STRUCTURED_PROFILE_LIMITS.summary,
          fields,
        ) ?? "",
    };
    if (!isBlankEducation(row)) {
      if (!row.school) {
        fields[`education.${index}`] = "School is required for each education entry.";
      }
      rows.push(row);
    }
  });
  return rows;
}

function parseProjectList(
  value: unknown,
  fields: Record<string, string>,
): ProfileProject[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (!Array.isArray(value)) {
    fields.projects = "Projects are invalid.";
    return [];
  }
  if (value.length > STRUCTURED_PROFILE_LIMITS.listMax) {
    fields.projects = `Add at most ${STRUCTURED_PROFILE_LIMITS.listMax} projects.`;
    return [];
  }

  const rows: ProfileProject[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fields[`projects.${index}`] = "Project entry is invalid.";
      return;
    }
    const record = item as Record<string, unknown>;
    const row: ProfileProject = {
      name:
        boundedString(
          record.name,
          `projects.${index}.name`,
          STRUCTURED_PROFILE_LIMITS.projectName,
          fields,
        ) ?? "",
      url:
        optionalHttpUrl(
          record.url,
          `projects.${index}.url`,
          STRUCTURED_PROFILE_LIMITS.socialUrl,
          fields,
        ) ?? "",
      technologies:
        boundedString(
          record.technologies,
          `projects.${index}.technologies`,
          STRUCTURED_PROFILE_LIMITS.technologies,
          fields,
        ) ?? "",
      summary:
        boundedString(
          record.summary,
          `projects.${index}.summary`,
          STRUCTURED_PROFILE_LIMITS.summary,
          fields,
        ) ?? "",
    };
    if (!isBlankProject(row)) {
      if (!row.name) {
        fields[`projects.${index}`] = "Project name is required.";
      }
      rows.push(row);
    }
  });
  return rows;
}

export function parseStoredStructuredProfile(
  value: unknown,
): StructuredProfilePayload {
  const fields: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return collectStructuredProfile({}, fields);
  }
  return collectStructuredProfile(value as Record<string, unknown>, fields);
}

export function parseJsonList<T>(
  value: unknown,
  parse: (items: unknown[]) => T[],
): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return parse(value);
  return [];
}

export function currentEmployerFromExperiences(
  experiences: ProfileExperience[],
): string | null {
  const current = experiences.find((row) => row.isCurrent && row.company);
  if (current) return current.company;
  const first = experiences.find((row) => row.company);
  return first?.company ?? null;
}

export function skillsTextFromProfile(payload: StructuredProfilePayload) {
  const parts = [
    ...payload.domains,
    ...payload.projects
      .flatMap((project) =>
        project.technologies
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
  ];
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(", ") : null;
}

export function formatExperienceDates(row: ProfileExperience) {
  if (row.isCurrent) {
    return row.startDate ? `${row.startDate} – Present` : "Present";
  }
  if (row.startDate && row.endDate) {
    return `${row.startDate} – ${row.endDate}`;
  }
  return row.startDate || row.endDate || "";
}

export function formatEducationDates(row: ProfileEducation) {
  if (row.startDate && row.endDate) {
    return `${row.startDate} – ${row.endDate}`;
  }
  return row.startDate || row.endDate || "";
}

export type ProfileCompletenessInput = {
  name: string;
  location: string;
  roleTitle: string;
  aboutText: string;
  domains: string[];
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  linkedInUrl: string;
  githubUrl: string;
  portfolioUrl: string;
};

export function profileCompletenessPercent(input: ProfileCompletenessInput) {
  const checks = [
    Boolean(input.name.trim()),
    Boolean(input.location.trim()),
    Boolean(input.roleTitle.trim()),
    input.aboutText.trim().length >= 20,
    input.domains.length > 0,
    input.experiences.some((row) => row.title.trim() && row.company.trim()),
    input.education.some((row) => row.school.trim()),
    Boolean(
      input.linkedInUrl.trim() ||
        input.githubUrl.trim() ||
        input.portfolioUrl.trim(),
    ),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function isPersonProfilePublished(input: {
  roleTitle?: string | null;
  aboutText?: string | null;
  experiences?: ProfileExperience[];
  education?: ProfileEducation[];
  githubUrl?: string | null;
  linkedInUrl?: string | null;
  leetcodeUrl?: string | null;
}) {
  return Boolean(
    input.roleTitle?.trim() ||
      (input.aboutText?.trim().length ?? 0) > 0 ||
      (input.experiences ?? []).some((row) => row.title.trim() && row.company.trim()) ||
      (input.education ?? []).some((row) => row.school.trim()) ||
      input.githubUrl?.trim() ||
      input.linkedInUrl?.trim() ||
      input.leetcodeUrl?.trim(),
  );
}

export function currentRoleSummary(experiences: ProfileExperience[]) {
  const current = experiences.find((row) => row.isCurrent && row.title && row.company);
  const first = experiences.find((row) => row.title && row.company);
  const row = current ?? first;
  if (!row) return null;
  return { title: row.title, company: row.company, isCurrent: Boolean(current) };
}

export function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "•";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}
