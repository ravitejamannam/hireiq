import { EVIDENCE_INLINE_TEXT_MAX } from "@/lib/validation/candidate-evidence-validation";
import {
  CAPTURE_INVALID_TEXT,
  CAPTURE_NO_TEXT,
  EvidenceCaptureError,
} from "@/lib/candidates/evidence-capture/evidence-capture-errors";

export class EvidenceCaptureValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "CAPTURE_INVALID") {
    super(message);
    this.name = "EvidenceCaptureValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EvidenceCaptureValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function validateCaptureJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateCaptureApplicationId(value: unknown) {
  return parsePositiveInt(value, "Application");
}

export function validateRecruiterEvidenceText(value: unknown) {
  if (typeof value !== "string") {
    throw new EvidenceCaptureError(
      "Evidence text is invalid.",
      CAPTURE_INVALID_TEXT,
    );
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new EvidenceCaptureError(
      "Evidence text is required.",
      CAPTURE_NO_TEXT,
    );
  }
  if (trimmed.length > EVIDENCE_INLINE_TEXT_MAX) {
    throw new EvidenceCaptureError(
      "Evidence text is too long.",
      CAPTURE_INVALID_TEXT,
    );
  }

  return trimmed;
}

export function rejectForbiddenCaptureFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.email;
  void record.phone;
  void record.skills;
  void record.role;
  void record.location;
  void record.experienceYears;
  void record.currentEmployer;
  void record.expectedCTC;
  void record.score;
  void record.expertScore;
  void record.confidence;
  void record.embedding;
  void record.companyPersonId;
}
