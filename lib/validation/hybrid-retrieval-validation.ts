import { PortalRole } from "@prisma/client";

import {
  DEFAULT_HYBRID_RETRIEVAL_LIMIT,
  MAX_HYBRID_RETRIEVAL_LIMIT,
  MIN_HYBRID_RETRIEVAL_LIMIT,
} from "@/lib/retrieval/hybrid-retrieval-versions";

export class HybridRetrievalValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "HYBRID_RETRIEVAL_INVALID") {
    super(message);
    this.name = "HybridRetrievalValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HybridRetrievalValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function isAdminHybridRetrievalRole(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateHybridRetrievalJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateHybridRetrievalRunId(value: unknown, label: string) {
  return parsePositiveInt(value, label);
}

export function validateHybridRetrievalLimit(value: unknown) {
  if (value == null || value === "") {
    return DEFAULT_HYBRID_RETRIEVAL_LIMIT;
  }
  const parsed = parsePositiveInt(value, "Limit");
  if (parsed < MIN_HYBRID_RETRIEVAL_LIMIT || parsed > MAX_HYBRID_RETRIEVAL_LIMIT) {
    throw new HybridRetrievalValidationError(
      `Limit must be between ${MIN_HYBRID_RETRIEVAL_LIMIT} and ${MAX_HYBRID_RETRIEVAL_LIMIT}.`,
    );
  }
  return parsed;
}

export function rejectForbiddenHybridRetrievalFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.candidateScore;
  void record.hiringScore;
  void record.qualityScore;
  void record.recommendationScore;
  void record.shortlistScore;
  void record.status;
}
