import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";
import { HostedApplyValidationError } from "@/lib/apply/hosted-apply-errors";
import {
  collectStructuredProfile,
  type StructuredProfilePayload,
} from "@/lib/profiles/structured-profile";

const NAME_MAX = 200;
const EMAIL_MAX = 254;
const PHONE_MAX = 32;
const LOCATION_MAX = 200;
const LINKEDIN_MAX = 2048;
const COVER_LETTER_MAX = 8000;
const TOKEN_MAX = 128;
const IDEMPOTENCY_KEY_MAX = 80;
const EXPERIENCE_MAX = 80;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_RE = /^[0-9+\-().\s]+$/;

export type HostedApplySubmitInput = {
  name: string;
  emailNormalized: string;
  phone: string | null;
  location: string | null;
  experienceYears: number | null;
  linkedInUrl: string | null;
  coverLetter: string | null;
  consentAccepted: true;
  profile: StructuredProfilePayload;
};

function rejectControls(value: string, field: string, fields: Record<string, string>) {
  if (CONTROL_CHARS.test(value)) {
    fields[field] = `${field} contains invalid characters.`;
  }
}

function optionalTrimmed(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function validatePublicApplyToken(token: unknown) {
  if (typeof token !== "string" || !token.trim() || token.length > TOKEN_MAX) {
    return null;
  }

  return token.trim();
}

export function validateIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HostedApplyValidationError({
      idempotencyKey: "Idempotency key is required.",
    });
  }

  const trimmed = value.trim();
  if (trimmed.length > IDEMPOTENCY_KEY_MAX || !UUID_RE.test(trimmed)) {
    throw new HostedApplyValidationError({
      idempotencyKey: "Idempotency key is invalid.",
    });
  }

  return trimmed;
}

export function validateHttpUrl(value: string, field: string) {
  if (value.length > LINKEDIN_MAX) {
    return `${field} is too long.`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${field} is invalid.`;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `${field} must use http or https.`;
  }

  return null;
}

export function validateHostedApplySubmitBody(body: unknown): HostedApplySubmitInput {
  const fields: Record<string, string> = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HostedApplyValidationError({
      form: "Application details are invalid.",
    });
  }

  const record = body as Record<string, unknown>;
  void record.companyId;
  void record.jobId;
  void record.distributionId;
  void record.specificationVersionId;
  void record.candidateId;
  void record.applicationId;
  void record.userId;
  void record.applyTokenId;
  void record.lifecycle;

  if (typeof record.name !== "string" || !record.name.trim()) {
    fields.name = "Name is required.";
  } else if (record.name.trim().length > NAME_MAX) {
    fields.name = "Name is too long.";
  } else {
    rejectControls(record.name, "name", fields);
  }

  if (typeof record.email !== "string" || !record.email.trim()) {
    fields.email = "Email is required.";
  } else if (record.email.trim().length > EMAIL_MAX) {
    fields.email = "Email is too long.";
  }

  if (record.consent !== true) {
    fields.consent = "Consent is required.";
  }

  void record.selfIdGender;
  void record.selfIdConsentedAt;

  const phoneRaw = optionalTrimmed(record.phone);
  if (phoneRaw === undefined) {
    fields.phone = "Phone is invalid.";
  } else if (phoneRaw && phoneRaw.length > PHONE_MAX) {
    fields.phone = "Phone is too long.";
  } else if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
    fields.phone = "Phone is invalid.";
  }

  const locationRaw = optionalTrimmed(record.location);
  if (locationRaw === undefined) {
    fields.location = "Location is invalid.";
  } else if (locationRaw && locationRaw.length > LOCATION_MAX) {
    fields.location = "Location is too long.";
  } else if (locationRaw) {
    rejectControls(locationRaw, "location", fields);
  }

  let experienceYears: number | null = null;
  if (
    record.experienceYears !== null &&
    record.experienceYears !== undefined &&
    record.experienceYears !== ""
  ) {
    const parsed =
      typeof record.experienceYears === "number"
        ? record.experienceYears
        : Number.parseInt(String(record.experienceYears), 10);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > EXPERIENCE_MAX
    ) {
      fields.experienceYears = "Years of experience is invalid.";
    } else {
      experienceYears = parsed;
    }
  }

  const coverRaw = optionalTrimmed(record.coverLetter);
  if (coverRaw === undefined) {
    fields.coverLetter = "Cover letter is invalid.";
  } else if (coverRaw && coverRaw.length > COVER_LETTER_MAX) {
    fields.coverLetter = "Cover letter is too long.";
  } else if (coverRaw && CONTROL_CHARS.test(coverRaw)) {
    fields.coverLetter = "Cover letter contains invalid characters.";
  }

  const profile = collectStructuredProfile(record, fields);

  if (Object.keys(fields).length > 0) {
    throw new HostedApplyValidationError(fields);
  }

  const emailNormalized = normalizeIdentityEmail(String(record.email));
  if (!isPlausibleIdentityEmail(emailNormalized) || emailNormalized.length > EMAIL_MAX) {
    throw new HostedApplyValidationError({ email: "Email is invalid." });
  }

  return {
    name: String(record.name).trim(),
    emailNormalized,
    phone: typeof phoneRaw === "string" ? phoneRaw : null,
    location: typeof locationRaw === "string" ? locationRaw : null,
    experienceYears,
    linkedInUrl: profile.linkedInUrl,
    coverLetter: typeof coverRaw === "string" ? coverRaw : null,
    consentAccepted: true,
    profile,
  };
}
