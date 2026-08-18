import { CandidateIdentitySignalKind } from "@prisma/client";

export const IDENTITY_REASON_CODES = [
  "EMAIL_EXACT",
  "PHONE_EXACT",
  "PROVIDER_CANDIDATE_ID",
  "LINKEDIN_URL_EXACT",
  "ADMIN_LINK",
  "ADMIN_UNLINK",
  "AMBIGUOUS_EMAIL_SHARED",
  "MANUAL_REVIEW",
  "IDENTITY_GROUP_CONFLICT",
] as const;

export type IdentityReasonCode = (typeof IDENTITY_REASON_CODES)[number];

export const IDENTITY_SIGNAL_KINDS = [
  CandidateIdentitySignalKind.EMAIL,
  CandidateIdentitySignalKind.PHONE,
  CandidateIdentitySignalKind.PROVIDER_CANDIDATE_ID,
  CandidateIdentitySignalKind.LINKEDIN_URL,
] as const;

export class CandidateIdentityValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "IDENTITY_INVALID") {
    super(message);
    this.name = "CandidateIdentityValidationError";
    this.code = code;
  }
}

export const IDENTITY_GROUP_CONFLICT = "IDENTITY_GROUP_CONFLICT";
export const IDENTITY_CROSS_COMPANY = "IDENTITY_CROSS_COMPANY";
export const IDENTITY_SELF_LINK = "IDENTITY_SELF_LINK";

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CandidateIdentityValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function validateIdentityCandidateId(value: unknown) {
  return parsePositiveInt(value, "Candidate");
}

export function validateLinkCandidateIds(
  leftCandidateId: unknown,
  rightCandidateId: unknown,
) {
  const left = validateIdentityCandidateId(leftCandidateId);
  const right = validateIdentityCandidateId(rightCandidateId);
  if (left === right) {
    throw new CandidateIdentityValidationError(
      "A candidate cannot be linked to itself.",
      IDENTITY_SELF_LINK,
    );
  }
  return { leftCandidateId: left, rightCandidateId: right };
}

export function validateIdentityReasonCodes(value: unknown): IdentityReasonCode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CandidateIdentityValidationError("Reason codes are invalid.");
  }

  const codes: IdentityReasonCode[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isIdentityReasonCode(item)) {
      throw new CandidateIdentityValidationError("Reason codes are invalid.");
    }
    if (!codes.includes(item)) {
      codes.push(item);
    }
  }
  return codes;
}

export function isIdentityReasonCode(value: string): value is IdentityReasonCode {
  return (IDENTITY_REASON_CODES as readonly string[]).includes(value);
}

export function validateIdentitySignalKind(value: unknown): CandidateIdentitySignalKind {
  if (
    typeof value !== "string" ||
    !IDENTITY_SIGNAL_KINDS.includes(value as CandidateIdentitySignalKind)
  ) {
    throw new CandidateIdentityValidationError("Identity signal kind is invalid.");
  }
  return value as CandidateIdentitySignalKind;
}

export function rejectBrowserTenantAuthority(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  void (input as Record<string, unknown>).companyId;
}
