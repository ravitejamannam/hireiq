import {
  JobRequirementCategory,
  RequirementSupportState,
} from "@prisma/client";

import { hashIntelligenceSnapshot } from "@/lib/candidates/matching/matching-engine";
import type {
  MatcherV2Claim,
  MatcherV2Requirement,
  RequirementAssessmentDraft,
} from "@/lib/candidates/matching/matching-v2-types";
import { MATCH_V2_REASON } from "@/lib/candidates/matching/matching-v2-versions";
import { canonicalSkillKey } from "@/lib/ontology/skill-alias";

export { hashIntelligenceSnapshot };

function unsupported(jobRequirementId: number): RequirementAssessmentDraft {
  return {
    jobRequirementId,
    supportState: RequirementSupportState.UNSUPPORTED,
    method: "deterministic-v2",
    reasonCode: MATCH_V2_REASON.REQUIREMENT_UNSUPPORTED,
    claimId: null,
    evidenceId: null,
  };
}

function unknown(jobRequirementId: number): RequirementAssessmentDraft {
  return {
    jobRequirementId,
    supportState: RequirementSupportState.UNKNOWN,
    method: "deterministic-v2",
    reasonCode: MATCH_V2_REASON.NO_SUPPORTING_CLAIM,
    claimId: null,
    evidenceId: null,
  };
}

function isSkillRequirement(requirement: MatcherV2Requirement) {
  if (requirement.skillCanonicalKey) {
    return true;
  }
  return (
    (requirement.category === JobRequirementCategory.REQUIRED ||
      requirement.category === JobRequirementCategory.PREFERRED) &&
    Boolean(requirement.normalizedValue) &&
    (requirement.sourceField === "primarySkills" ||
      requirement.sourceField === "mustHaveRequirements" ||
      requirement.sourceField === "niceToHaveRequirements")
  );
}

function isLocationRequirement(requirement: MatcherV2Requirement) {
  return requirement.sourceField === "location";
}

export function computeRequirementAssessments(input: {
  requirements: MatcherV2Requirement[];
  claims: MatcherV2Claim[];
}): RequirementAssessmentDraft[] {
  const skillClaims = input.claims.filter((claim) => claim.claimType === "SKILL");
  const locationClaims = input.claims.filter(
    (claim) => claim.claimType === "LOCATION",
  );

  return input.requirements.map((requirement) => {
    if (
      requirement.category === JobRequirementCategory.AMBIGUOUS ||
      requirement.category === JobRequirementCategory.RESPONSIBILITY ||
      (requirement.category === JobRequirementCategory.CONSTRAINT &&
        !isLocationRequirement(requirement))
    ) {
      return unsupported(requirement.id);
    }

    if (isLocationRequirement(requirement)) {
      const target = requirement.normalizedValue ?? "";
      const claim = locationClaims.find(
        (row) =>
          row.polarity === "POSITIVE" &&
          row.normalizedValue === target,
      );
      if (!claim) {
        return unknown(requirement.id);
      }
      return {
        jobRequirementId: requirement.id,
        supportState: RequirementSupportState.SUPPORTED,
        method: "deterministic-v2",
        reasonCode: MATCH_V2_REASON.EXACT_LOCATION_MATCH,
        claimId: claim.id,
        evidenceId: claim.evidenceId,
      };
    }

    if (!isSkillRequirement(requirement)) {
      return unsupported(requirement.id);
    }

    const target =
      requirement.skillCanonicalKey ??
      canonicalSkillKey(requirement.normalizedValue ?? requirement.sourceText);
    const matches = skillClaims.filter((claim) => claim.normalizedValue === target);
    const negated = matches.find((claim) => claim.polarity === "NEGATED");
    if (negated) {
      return {
        jobRequirementId: requirement.id,
        supportState: RequirementSupportState.CONTRADICTED,
        method: "deterministic-v2",
        reasonCode: MATCH_V2_REASON.NEGATED_SKILL,
        claimId: negated.id,
        evidenceId: negated.evidenceId,
      };
    }
    const supported = matches.find((claim) => claim.polarity === "POSITIVE");
    if (!supported) {
      return unknown(requirement.id);
    }
    return {
      jobRequirementId: requirement.id,
      supportState: RequirementSupportState.SUPPORTED,
      method: "deterministic-v2",
      reasonCode: supported.viaAlias
        ? MATCH_V2_REASON.ALIAS_SKILL_MATCH
        : MATCH_V2_REASON.EXACT_SKILL_MATCH,
      claimId: supported.id,
      evidenceId: supported.evidenceId,
    };
  });
}

export function explainAssessment(input: {
  supportState: RequirementSupportState;
  reasonCode: string;
  sourceText: string;
  category: JobRequirementCategory;
}): { why: string; gap: string | null; uncertainty: string | null } {
  if (input.supportState === RequirementSupportState.SUPPORTED) {
    return {
      why: `Available evidence supports “${input.sourceText}”.`,
      gap: null,
      uncertainty: null,
    };
  }
  if (input.supportState === RequirementSupportState.CONTRADICTED) {
    return {
      why: `Available evidence mentions “${input.sourceText}” in the negative.`,
      gap: `Evidence does not support “${input.sourceText}”.`,
      uncertainty: "A negative mention is not the same as missing evidence.",
    };
  }
  if (input.supportState === RequirementSupportState.UNKNOWN) {
    return {
      why: `This application was not excluded. Insufficient available evidence for “${input.sourceText}”.`,
      gap: `No supporting evidence was found for “${input.sourceText}”.`,
      uncertainty: "UNKNOWN is not a rejection. Absence of evidence is not evidence of absence.",
    };
  }
  return {
    why: `This requirement is not skill-matched in Matcher V2 (“${input.sourceText}”).`,
    gap: input.category === JobRequirementCategory.AMBIGUOUS
      ? "The job line is ambiguous and was not promoted to a hard requirement."
      : null,
    uncertainty:
      input.category === JobRequirementCategory.AMBIGUOUS
        ? "The extractor marked this line AMBIGUOUS."
        : "Matcher V2 does not infer meaning beyond structured skill and location requirements.",
  };
}
