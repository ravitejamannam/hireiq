import { PortalRole } from "@prisma/client";

import {
  DEFAULT_SEMANTIC_RETRIEVAL_LIMIT,
  MAX_SEMANTIC_RETRIEVAL_LIMIT,
  MIN_SEMANTIC_RETRIEVAL_LIMIT,
} from "@/lib/retrieval/semantic-retrieval-versions";

export class SemanticRetrievalValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "SEMANTIC_RETRIEVAL_INVALID") {
    super(message);
    this.name = "SemanticRetrievalValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SemanticRetrievalValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function isAdminSemanticRetrievalRole(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateSemanticRetrievalJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateSemanticRetrievalSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function validateSemanticRetrievalLimit(value: unknown) {
  if (value == null || value === "") {
    return DEFAULT_SEMANTIC_RETRIEVAL_LIMIT;
  }
  const parsed = parsePositiveInt(value, "Limit");
  if (
    parsed < MIN_SEMANTIC_RETRIEVAL_LIMIT ||
    parsed > MAX_SEMANTIC_RETRIEVAL_LIMIT
  ) {
    throw new SemanticRetrievalValidationError(
      `Limit must be between ${MIN_SEMANTIC_RETRIEVAL_LIMIT} and ${MAX_SEMANTIC_RETRIEVAL_LIMIT}.`,
    );
  }
  return parsed;
}

export function rejectForbiddenSemanticRetrievalFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.candidateScore;
  void record.matchScore;
  void record.confidence;
  void record.status;
  void record.hybridScore;
}
