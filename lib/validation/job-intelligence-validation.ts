export class JobIntelligenceValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "JOB_INTELLIGENCE_INVALID") {
    super(message);
    this.name = "JobIntelligenceValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new JobIntelligenceValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function validateJobIntelligenceJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateJobIntelligenceSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function rejectForbiddenJobIntelligenceFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.score;
  void record.confidence;
  void record.embedding;
  void record.candidateScore;
}
