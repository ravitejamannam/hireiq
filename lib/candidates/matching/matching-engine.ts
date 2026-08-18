import { createHash } from "node:crypto";

import {
  CandidateMatchRequirementCategory,
  CandidateMatchResult,
} from "@prisma/client";

import { MATCH_REASON } from "@/lib/candidates/matching/matching-versions";
import type {
  EligibleMatchingClaim,
  MatchingSpecInput,
  RequirementMatchDraft,
} from "@/lib/candidates/matching/matching-types";
import {
  normalizeMatchingText,
  tokenizePrimarySkills,
} from "@/lib/candidates/matching/skill-tokenizer";

export function hashIntelligenceSnapshot(
  pairs: Array<{ evidenceId: number; runId: number }>,
) {
  const lines = pairs
    .map((pair) => `${pair.evidenceId}:${pair.runId}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

function unsupportedRow(
  requirementKey: string,
  sourceField: string,
  category: CandidateMatchRequirementCategory,
): RequirementMatchDraft {
  return {
    requirementKey,
    sourceField,
    category,
    result: CandidateMatchResult.UNSUPPORTED,
    reasonCode: MATCH_REASON.REQUIREMENT_UNSUPPORTED,
    claimId: null,
    evidenceId: null,
  };
}

function unknownRow(
  requirementKey: string,
  sourceField: string,
  category: CandidateMatchRequirementCategory,
): RequirementMatchDraft {
  return {
    requirementKey,
    sourceField,
    category,
    result: CandidateMatchResult.UNKNOWN,
    reasonCode: MATCH_REASON.NO_SUPPORTING_CLAIM,
    claimId: null,
    evidenceId: null,
  };
}

export function computeRequirementMatches(input: {
  spec: MatchingSpecInput;
  claims: EligibleMatchingClaim[];
}): RequirementMatchDraft[] {
  const skillByNormalized = new Map<string, EligibleMatchingClaim>();
  const locationByNormalized = new Map<string, EligibleMatchingClaim>();

  for (const claim of input.claims) {
    if (claim.claimType === "SKILL") {
      skillByNormalized.set(claim.normalizedValue, claim);
    }
    if (claim.claimType === "LOCATION") {
      locationByNormalized.set(claim.normalizedValue, claim);
    }
  }

  const rows: RequirementMatchDraft[] = [];

  for (const token of tokenizePrimarySkills(input.spec.primarySkills)) {
    const claim = skillByNormalized.get(token.normalized);
    if (claim) {
      rows.push({
        requirementKey: `primarySkills:${token.normalized}`,
        sourceField: "primarySkills",
        category: CandidateMatchRequirementCategory.SKILL,
        result: CandidateMatchResult.SATISFIED,
        reasonCode: MATCH_REASON.EXACT_SKILL_MATCH,
        claimId: claim.id,
        evidenceId: claim.evidenceId,
      });
    } else {
      rows.push({
        ...unknownRow(
          `primarySkills:${token.normalized}`,
          "primarySkills",
          CandidateMatchRequirementCategory.SKILL,
        ),
      });
    }
  }

  const locationText = input.spec.location?.trim() ?? "";
  if (locationText) {
    const normalizedLocation = normalizeMatchingText(locationText);
    const claim = locationByNormalized.get(normalizedLocation);
    if (claim) {
      rows.push({
        requirementKey: "location",
        sourceField: "location",
        category: CandidateMatchRequirementCategory.LOCATION,
        result: CandidateMatchResult.SATISFIED,
        reasonCode: MATCH_REASON.EXACT_LOCATION_MATCH,
        claimId: claim.id,
        evidenceId: claim.evidenceId,
      });
    } else {
      rows.push(
        unknownRow(
          "location",
          "location",
          CandidateMatchRequirementCategory.LOCATION,
        ),
      );
    }
  }

  if (input.spec.mustHaveRequirements?.trim()) {
    rows.push(
      unsupportedRow(
        "mustHaveRequirements",
        "mustHaveRequirements",
        CandidateMatchRequirementCategory.MUST_HAVE,
      ),
    );
  }

  if (input.spec.niceToHaveRequirements?.trim()) {
    rows.push(
      unsupportedRow(
        "niceToHaveRequirements",
        "niceToHaveRequirements",
        CandidateMatchRequirementCategory.NICE_TO_HAVE,
      ),
    );
  }

  return rows;
}
