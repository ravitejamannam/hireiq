import { HumanRelevanceLabel, PortalRole } from "@prisma/client";

import { HUMAN_RELEVANCE_INVALID, HumanRelevanceError } from "@/lib/relevance/human-relevance-errors";

const LABELS = new Set<string>([HumanRelevanceLabel.RELEVANT, HumanRelevanceLabel.NOT_RELEVANT]);

export function canCreateHumanRelevanceJudgment(role: PortalRole) {
  return role === PortalRole.CLIENT;
}

export function canReadHumanRelevanceJudgments(role: PortalRole) {
  return role === PortalRole.CLIENT || role === PortalRole.ADMIN;
}

export function parseHumanRelevanceLabel(value: unknown) {
  if (typeof value !== "string" || !LABELS.has(value)) {
    throw new HumanRelevanceError("Relevance label is invalid.", HUMAN_RELEVANCE_INVALID);
  }
  return value as HumanRelevanceLabel;
}

export function parseIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 8 || value.length > 200) {
    throw new HumanRelevanceError("Idempotency key is invalid.", HUMAN_RELEVANCE_INVALID);
  }
  return value.trim();
}

export function rejectForbiddenHumanRelevanceFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const record = input as Record<string, unknown>;
  for (const key of ["companyId", "candidateScore", "status", "skillsText", "m10Rank", "rrfScore"]) {
    if (key in record && record[key] != null && key !== "companyId") {
      throw new HumanRelevanceError(`${key} is not a relevance label.`, HUMAN_RELEVANCE_INVALID);
    }
  }
}
