import { PortalRole } from "@prisma/client";

export class CandidateRankingValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "RANKING_INVALID") {
    super(message);
    this.name = "CandidateRankingValidationError";
    this.code = code;
  }
}

function parsePositiveInt(value: unknown, label: string) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CandidateRankingValidationError(`${label} is invalid.`);
  }
  return parsed;
}

export function isAdminRankingRole(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateRankingJobId(value: unknown) {
  return parsePositiveInt(value, "Job");
}

export function validateRankingSpecificationId(value: unknown) {
  return parsePositiveInt(value, "Specification");
}

export function rejectForbiddenRankingFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  void record.companyId;
  void record.claimId;
  void record.evidenceId;
  void record.result;
  void record.rank;
  void record.score;
  void record.rankingScore;
  void record.fitScore;
  void record.confidence;
  void record.percentile;
  void record.expertScore;
  void record.currentPublishedSpecificationVersionId;
}
