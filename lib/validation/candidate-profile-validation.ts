import { collectStructuredProfile, type StructuredProfilePayload } from "@/lib/profiles/structured-profile";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const CANDIDATE_PROFILE_LIMITS = {
  name: 200,
  headline: 200,
  location: 200,
  currentEmployer: 200,
  expectedCTC: 100,
  skillsText: 8000,
  linkedInUrl: 2048,
  experienceYearsMin: 0,
  experienceYearsMax: 80,
} as const;

export class CandidateProfileValidationError extends Error {
  constructor(message = "Profile details are invalid.") {
    super(message);
    this.name = "CandidateProfileValidationError";
  }
}

function optionalTrimmed(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new CandidateProfileValidationError("Profile details are invalid.");
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalBoundedString(
  value: unknown,
  label: string,
  max: number,
) {
  const trimmed = optionalTrimmed(value);
  if (trimmed === null) {
    return null;
  }
  if (trimmed.length > max) {
    throw new CandidateProfileValidationError(`${label} is too long.`);
  }
  if (CONTROL_CHARS.test(trimmed)) {
    throw new CandidateProfileValidationError(`${label} contains invalid characters.`);
  }
  return trimmed;
}

function optionalExperienceYears(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (
    !Number.isInteger(parsed) ||
    parsed < CANDIDATE_PROFILE_LIMITS.experienceYearsMin ||
    parsed > CANDIDATE_PROFILE_LIMITS.experienceYearsMax
  ) {
    throw new CandidateProfileValidationError(
      "Experience years must be a whole number between 0 and 80.",
    );
  }

  return parsed;
}

export function validateCandidateId(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CandidateProfileValidationError("Candidate is invalid.");
  }
  return parsed;
}

export type ValidatedCandidateProfileUpdate = {
  headline: string | null;
  location: string | null;
  experienceYears: number | null;
  skillsText: string | null;
  currentEmployer: string | null;
  expectedCTC: string | null;
  linkedInUrl: string | null;
  name: string | null;
  profile: StructuredProfilePayload;
};

export function validateCandidateProfileUpdate(
  input: unknown,
): ValidatedCandidateProfileUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CandidateProfileValidationError("Profile details are invalid.");
  }

  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.candidateId;
  void record.email;
  void record.phone;
  void record.role;
  void record.status;
  void record.matchScore;
  void record.rankingScore;

  const name = optionalBoundedString(
    record.name,
    "Name",
    CANDIDATE_PROFILE_LIMITS.name,
  );
  if (record.name !== undefined && record.name !== null && name === null) {
    throw new CandidateProfileValidationError("Name is required.");
  }

  const fields: Record<string, string> = {};
  const profile = collectStructuredProfile(
    {
      ...record,
      roleTitle: record.roleTitle ?? record.headline,
      videoUrl: record.videoUrl ?? record.videoResumeUrl,
    },
    fields,
  );
  if (Object.keys(fields).length > 0) {
    throw new CandidateProfileValidationError(Object.values(fields)[0]);
  }

  return {
    headline: optionalBoundedString(
      record.headline ?? record.roleTitle,
      "Headline",
      CANDIDATE_PROFILE_LIMITS.headline,
    ),
    location: optionalBoundedString(
      record.location,
      "Location",
      CANDIDATE_PROFILE_LIMITS.location,
    ),
    experienceYears: optionalExperienceYears(record.experienceYears),
    skillsText: optionalBoundedString(
      record.skillsText,
      "Skills",
      CANDIDATE_PROFILE_LIMITS.skillsText,
    ),
    currentEmployer: optionalBoundedString(
      record.currentEmployer,
      "Current employer",
      CANDIDATE_PROFILE_LIMITS.currentEmployer,
    ),
    expectedCTC: optionalBoundedString(
      record.expectedCTC,
      "Expected CTC",
      CANDIDATE_PROFILE_LIMITS.expectedCTC,
    ),
    linkedInUrl: profile.linkedInUrl,
    name,
    profile,
  };
}
