import { PortalRole } from "@prisma/client";

export class EvidenceGraphValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "EVIDENCE_GRAPH_INVALID") {
    super(message);
    this.name = "EvidenceGraphValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EvidenceGraphValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function isAdminEvidenceGraphRole(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateEvidenceGraphJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateEvidenceGraphSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function rejectForbiddenEvidenceGraphFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.candidateScore;
  void record.matchScore;
  void record.confidence;
  void record.hybridScore;
  void record.status;
}
