import { PortalRole } from "@prisma/client";

export class RequirementAssessmentValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "MATCHER_V2_INVALID") {
    super(message);
    this.name = "RequirementAssessmentValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RequirementAssessmentValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function isAdminMatcherV2Role(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateAssessmentJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateAssessmentSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function rejectForbiddenAssessmentFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.candidateScore;
  void record.matchScore;
  void record.confidence;
  void record.embedding;
  void record.status;
}
