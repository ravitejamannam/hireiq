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
import { inferredSqlDatabase, parseRequirementChecks, yearsCheckPasses } from "@/lib/jobs/requirement-checks";
import { resolveSkillAlias } from "@/lib/ontology/skill-alias";

export function hashIntelligenceSnapshot(
  pairs: Array<{ evidenceId: number; runId: number }>,
) {
  const lines = pairs
    .map((pair) => `${pair.evidenceId}:${pair.runId}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
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
    const resolved = resolveSkillAlias(token.normalized);
    const claim =
      skillByNormalized.get(token.normalized) ??
      (resolved ? skillByNormalized.get(resolved.canonicalKey) : undefined);
    if (claim) {
      rows.push({
        requirementKey: `primarySkills:${token.normalized}`,
        sourceField: "primarySkills",
        category: CandidateMatchRequirementCategory.SKILL,
        result: CandidateMatchResult.SATISFIED,
        reasonCode:
          resolved && resolved.canonicalKey !== token.normalized
            ? MATCH_REASON.ALIAS_SKILL_MATCH
            : MATCH_REASON.EXACT_SKILL_MATCH,
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
    } else if (
      input.spec.profileLocation &&
      locationText.toLowerCase().includes(input.spec.profileLocation.trim().toLowerCase())
    ) {
      rows.push({
        requirementKey: "location",
        sourceField: "location",
        category: CandidateMatchRequirementCategory.LOCATION,
        result: CandidateMatchResult.SATISFIED,
        reasonCode: `${MATCH_REASON.FROM_PROFILE}:${input.spec.profileLocation.trim()}`,
        claimId: null,
        evidenceId: null,
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

  for (const question of input.spec.screeningQuestions ?? []) {
    const normalizedQuestion = normalizeMatchingText(question);
    const claim = input.claims.find(
      (row) =>
        row.claimType === "SKILL" &&
        normalizedQuestion.includes(row.normalizedValue),
    );
    rows.push(
      claim
        ? {
            requirementKey: `screeningQuestions:${claim.normalizedValue}`,
            sourceField: "screeningQuestions",
            category: CandidateMatchRequirementCategory.SKILL,
            result: CandidateMatchResult.SATISFIED,
            reasonCode: MATCH_REASON.EXACT_SKILL_MATCH,
            claimId: claim.id,
            evidenceId: claim.evidenceId,
          }
        : unknownRow(
            `screeningQuestions:${normalizeMatchingText(question).slice(0, 80)}`,
            "screeningQuestions",
            CandidateMatchRequirementCategory.SKILL,
          ),
    );
  }

  for (const criterion of input.spec.rubricCriteria ?? []) {
    for (const token of tokenizePrimarySkills(criterion)) {
      const claim = skillByNormalized.get(token.normalized);
      rows.push(
        claim
          ? {
              requirementKey: `scoringRubric:${token.normalized}`,
              sourceField: "scoringRubric",
              category: CandidateMatchRequirementCategory.SKILL,
              result: CandidateMatchResult.SATISFIED,
              reasonCode: MATCH_REASON.EXACT_SKILL_MATCH,
              claimId: claim.id,
              evidenceId: claim.evidenceId,
            }
          : unknownRow(
              `scoringRubric:${token.normalized}`,
              "scoringRubric",
              CandidateMatchRequirementCategory.SKILL,
            ),
      );
    }
  }

  const resumeText = input.spec.resumeText ?? "";
  for (const sourceField of ["mustHaveRequirements", "niceToHaveRequirements"] as const) {
    const category =
      sourceField === "mustHaveRequirements"
        ? CandidateMatchRequirementCategory.MUST_HAVE
        : CandidateMatchRequirementCategory.NICE_TO_HAVE;
    for (const check of parseRequirementChecks(input.spec[sourceField], sourceField)) {
      const key = `${sourceField}:${check.kind}:${check.text.slice(0, 60)}`;
      if (check.kind === "years" && yearsCheckPasses(check, resumeText)) {
        rows.push({
          requirementKey: key,
          sourceField,
          category,
          result: CandidateMatchResult.SATISFIED,
          reasonCode: MATCH_REASON.RESUME_TEXT,
          claimId: null,
          evidenceId: null,
        });
        continue;
      }
      if (check.kind === "skill" && check.skill) {
        const direct = resumeText.toLowerCase().includes(check.skill.toLowerCase());
        const inferred = check.skill.toLowerCase() === "sql" ? inferredSqlDatabase(resumeText) : null;
        if (direct || inferred) {
          rows.push({
            requirementKey: key,
            sourceField,
            category,
            result: CandidateMatchResult.SATISFIED,
            reasonCode: inferred ? `${MATCH_REASON.INFERRED}:${inferred}` : MATCH_REASON.RESUME_TEXT,
            claimId: null,
            evidenceId: null,
          });
          continue;
        }
      }
      if (
        check.kind === "prose" &&
        (input.spec.verifiedProse ?? []).some((line) => line === check.text)
      ) {
        rows.push({
          requirementKey: key,
          sourceField,
          category,
          result: CandidateMatchResult.SATISFIED,
          reasonCode: MATCH_REASON.RESUME_TEXT,
          claimId: null,
          evidenceId: null,
        });
        continue;
      }
      if (check.kind === "domain" && check.skill && resumeText.toLowerCase().includes(check.skill.toLowerCase())) {
        rows.push({
          requirementKey: key,
          sourceField,
          category,
          result: CandidateMatchResult.SATISFIED,
          reasonCode: MATCH_REASON.RESUME_TEXT,
          claimId: null,
          evidenceId: null,
        });
        continue;
      }
      rows.push(unknownRow(key, sourceField, category));
    }
  }

  return rows;
}
