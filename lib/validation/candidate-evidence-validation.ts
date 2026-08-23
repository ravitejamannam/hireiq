import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
} from "@prisma/client";

export const EVIDENCE_INLINE_TEXT_MAX = 8000;

export class CandidateEvidenceValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "EVIDENCE_INVALID") {
    super(message);
    this.name = "CandidateEvidenceValidationError";
    this.code = code;
  }
}

const SOURCE_TYPES = [
  CandidateEvidenceSourceType.HOSTED_APPLY_SUBMISSION,
  CandidateEvidenceSourceType.INGESTION_EVENT,
  CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
  CandidateEvidenceSourceType.RESUME_DOCUMENT,
] as const;

const ORIGINS = [
  CandidateEvidenceOrigin.CANDIDATE_PROVIDED,
  CandidateEvidenceOrigin.PROVIDER_PROVIDED,
  CandidateEvidenceOrigin.RECRUITER_ENTERED,
  CandidateEvidenceOrigin.SYSTEM_RECORDED,
] as const;

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CandidateEvidenceValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function validateEvidenceCandidateId(value: unknown) {
  return parsePositiveInt(value, "Candidate");
}

export function validateEvidenceId(value: unknown) {
  return parsePositiveInt(value, "Evidence");
}

export function validateOptionalEvidenceApplicationId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return parsePositiveInt(value, "Application");
}

export function validateEvidenceSourceType(value: unknown) {
  if (
    typeof value !== "string" ||
    !SOURCE_TYPES.includes(value as CandidateEvidenceSourceType)
  ) {
    throw new CandidateEvidenceValidationError("Evidence source type is invalid.");
  }
  return value as CandidateEvidenceSourceType;
}

export function validateEvidenceOrigin(value: unknown) {
  if (
    typeof value !== "string" ||
    !ORIGINS.includes(value as CandidateEvidenceOrigin)
  ) {
    throw new CandidateEvidenceValidationError("Evidence origin is invalid.");
  }
  return value as CandidateEvidenceOrigin;
}

export function validateEvidenceInlineText(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new CandidateEvidenceValidationError("Evidence text is invalid.");
  }
  if (value.length > EVIDENCE_INLINE_TEXT_MAX) {
    throw new CandidateEvidenceValidationError("Evidence text is too long.");
  }
  return value;
}

export function rejectForbiddenEvidenceFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.email;
  void record.phone;
  void record.confidence;
  void record.score;
  void record.embedding;
  void record.companyPersonId;
  void record.verified;
  void record.matchScore;
  void record.rankingScore;
}
