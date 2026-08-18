export class CandidateIntelligenceValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "INTELLIGENCE_INVALID") {
    super(message);
    this.name = "CandidateIntelligenceValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CandidateIntelligenceValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function validateIntelligenceCandidateId(value: unknown) {
  return parsePositiveInt(value, "Candidate");
}

export function validateIntelligenceEvidenceId(value: unknown) {
  return parsePositiveInt(value, "Evidence");
}

export function rejectForbiddenIntelligenceFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.email;
  void record.phone;
  void record.confidence;
  void record.score;
  void record.verified;
  void record.matchScore;
  void record.rankingScore;
  void record.embedding;
  void record.companyPersonId;
}
