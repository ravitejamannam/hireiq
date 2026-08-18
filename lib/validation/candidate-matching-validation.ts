export class CandidateMatchingValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "MATCHING_INVALID") {
    super(message);
    this.name = "CandidateMatchingValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CandidateMatchingValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function validateMatchingApplicationId(value: unknown) {
  return parsePositiveInt(value, "Application");
}

export function validateMatchingSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function validateMatchingCandidateId(value: unknown) {
  return parsePositiveInt(value, "Candidate");
}

export function rejectForbiddenMatchingFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.claimId;
  void record.evidenceId;
  void record.result;
  void record.reasonCode;
  void record.matchScore;
  void record.rankingScore;
  void record.confidence;
  void record.currentPublishedSpecificationVersionId;
}
