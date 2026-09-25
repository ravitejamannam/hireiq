import { PortalRole } from "@prisma/client";

import {
  DEFAULT_LEXICAL_RETRIEVAL_LIMIT,
  MAX_LEXICAL_RETRIEVAL_LIMIT,
  MIN_LEXICAL_RETRIEVAL_LIMIT,
} from "@/lib/retrieval/lexical-retrieval-versions";

export class LexicalRetrievalValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "LEXICAL_RETRIEVAL_INVALID") {
    super(message);
    this.name = "LexicalRetrievalValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new LexicalRetrievalValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function isAdminLexicalRetrievalRole(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateLexicalRetrievalJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateLexicalRetrievalSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function validateLexicalRetrievalLimit(value: unknown) {
  if (value == null || value === "") {
    return DEFAULT_LEXICAL_RETRIEVAL_LIMIT;
  }
  const parsed = parsePositiveInt(value, "Limit");
  if (parsed < MIN_LEXICAL_RETRIEVAL_LIMIT || parsed > MAX_LEXICAL_RETRIEVAL_LIMIT) {
    throw new LexicalRetrievalValidationError(
      `Limit must be between ${MIN_LEXICAL_RETRIEVAL_LIMIT} and ${MAX_LEXICAL_RETRIEVAL_LIMIT}.`,
    );
  }
  return parsed;
}

export function rejectForbiddenLexicalRetrievalFields(input: unknown) {
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
