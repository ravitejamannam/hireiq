import { CandidateClaimType } from "@prisma/client";

import {
  CandidateIntelligenceError,
  INTELLIGENCE_AI_INVALID_OUTPUT,
  INTELLIGENCE_UNCHANGED_ERROR,
} from "@/lib/candidates/intelligence/intelligence-errors";
import type { ExtractedClaimDraft } from "@/lib/candidates/intelligence/intelligence-types";

export const CANDIDATE_INTELLIGENCE_MAX_CLAIMS = 40;
export const CANDIDATE_INTELLIGENCE_VALUE_MAX = 200;
export const CANDIDATE_INTELLIGENCE_VALUE_MIN = 2;

const ALLOWED_CLAIM_TYPES = [
  CandidateClaimType.SKILL,
  CandidateClaimType.EMPLOYER,
  CandidateClaimType.JOB_TITLE,
  CandidateClaimType.LOCATION,
] as const;

function invalidOutput(): never {
  throw new CandidateIntelligenceError(
    INTELLIGENCE_UNCHANGED_ERROR,
    INTELLIGENCE_AI_INVALID_OUTPUT,
  );
}

export function normalizeIntelligenceText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeClaimValue(value: string) {
  return normalizeIntelligenceText(value);
}

function isAllowedClaimType(value: unknown): value is CandidateClaimType {
  return (
    typeof value === "string" &&
    ALLOWED_CLAIM_TYPES.includes(value as CandidateClaimType)
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasEmploymentCue(evidence: string, employer: string) {
  return (
    evidence.includes(`worked at ${employer}`) ||
    evidence.includes(`worked for ${employer}`) ||
    evidence.includes(`employed at ${employer}`) ||
    evidence.includes(`employed by ${employer}`) ||
    evidence.includes(`joined ${employer}`) ||
    evidence.includes(`employee of ${employer}`) ||
    evidence.includes(`employee at ${employer}`) ||
    evidence.includes(`currently at ${employer}`) ||
    new RegExp(
      `(^|[\\s,.;:])at ${escapeRegExp(employer)}([\\s,.;:]|$)`,
    ).test(evidence)
  );
}

function isProductOnlyEmployerMention(evidence: string, employer: string) {
  const workedWith = evidence.includes(`worked with ${employer}`);
  const employed =
    evidence.includes(`worked at ${employer}`) ||
    evidence.includes(`worked for ${employer}`) ||
    evidence.includes(`employed at ${employer}`) ||
    evidence.includes(`employed by ${employer}`) ||
    evidence.includes(`joined ${employer}`);
  return workedWith && !employed;
}

function isNegatedSkillMention(evidence: string, skill: string) {
  const escaped = escapeRegExp(skill);
  const patterns = [
    new RegExp(`\\bhave not used ${escaped}\\b`),
    new RegExp(`\\bhas not used ${escaped}\\b`),
    new RegExp(`\\bhad not used ${escaped}\\b`),
    new RegExp(`\\bhaven't used ${escaped}\\b`),
    new RegExp(`\\bhasn't used ${escaped}\\b`),
    new RegExp(`\\bnever used ${escaped}\\b`),
    new RegExp(`\\bno experience (?:with|in) ${escaped}\\b`),
    new RegExp(`\\bnot used ${escaped}\\b`),
    new RegExp(`\\bdo not (?:use|know) ${escaped}\\b`),
    new RegExp(`\\bdid not use ${escaped}\\b`),
    new RegExp(`\\bdon't (?:use|know) ${escaped}\\b`),
    new RegExp(`\\bdidn't use ${escaped}\\b`),
    new RegExp(`\\bdoes not (?:use|know) ${escaped}\\b`),
  ];
  return patterns.some((pattern) => pattern.test(evidence));
}

function isClaimGrounded(
  claimType: CandidateClaimType,
  normalizedValue: string,
  normalizedEvidence: string,
) {
  if (
    normalizedValue.length < CANDIDATE_INTELLIGENCE_VALUE_MIN ||
    !normalizedEvidence.includes(normalizedValue)
  ) {
    return false;
  }

  if (claimType === CandidateClaimType.SKILL) {
    if (isNegatedSkillMention(normalizedEvidence, normalizedValue)) {
      return false;
    }
  }

  if (claimType === CandidateClaimType.EMPLOYER) {
    if (isProductOnlyEmployerMention(normalizedEvidence, normalizedValue)) {
      return false;
    }
    return hasEmploymentCue(normalizedEvidence, normalizedValue);
  }

  return true;
}

export function dedupeExtractedClaims(claims: ExtractedClaimDraft[]) {
  const seen = new Set<string>();
  const unique: ExtractedClaimDraft[] = [];
  for (const claim of claims) {
    const key = `${claim.claimType}:${claim.normalizedValue}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(claim);
  }
  return unique;
}

export function validateCandidateIntelligenceAiOutput(
  value: unknown,
  evidenceText: string,
): ExtractedClaimDraft[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidOutput();
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.claims)) {
    invalidOutput();
  }
  if (record.claims.length > CANDIDATE_INTELLIGENCE_MAX_CLAIMS) {
    invalidOutput();
  }

  const normalizedEvidence = normalizeIntelligenceText(evidenceText);
  const accepted: ExtractedClaimDraft[] = [];

  for (const item of record.claims) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      invalidOutput();
    }
    const claim = item as Record<string, unknown>;
    if (!isAllowedClaimType(claim.claimType)) {
      invalidOutput();
    }
    if (typeof claim.value !== "string") {
      invalidOutput();
    }
    const valueText = claim.value.trim();
    if (!valueText) {
      invalidOutput();
    }
    if (valueText.length > CANDIDATE_INTELLIGENCE_VALUE_MAX) {
      invalidOutput();
    }
    if (
      claim.normalizedValue !== undefined &&
      typeof claim.normalizedValue !== "string"
    ) {
      invalidOutput();
    }

    const normalizedValue = normalizeClaimValue(valueText);
    if (!isClaimGrounded(claim.claimType, normalizedValue, normalizedEvidence)) {
      continue;
    }

    accepted.push({
      claimType: claim.claimType,
      value: valueText,
      normalizedValue,
    });
  }

  return dedupeExtractedClaims(accepted);
}
