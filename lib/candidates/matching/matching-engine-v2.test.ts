import { describe, expect, it } from "vitest";
import {
  JobRequirementCategory,
  JobRequirementUncertainty,
  RequirementSupportState,
} from "@prisma/client";

import { computeRequirementAssessments, withVerbatimCitation } from "@/lib/candidates/matching/matching-engine-v2";
import type { MatcherV2Requirement } from "@/lib/candidates/matching/matching-v2-types";

function requirement(
  partial: Partial<MatcherV2Requirement> & Pick<MatcherV2Requirement, "id" | "sourceText">,
): MatcherV2Requirement {
  return {
    stableKey: `primarySkills:${partial.sourceText}`,
    sourceField: "primarySkills",
    category: JobRequirementCategory.REQUIRED,
    normalizedValue: partial.sourceText.toLowerCase(),
    skillCanonicalKey: partial.sourceText.toLowerCase(),
    uncertainty: JobRequirementUncertainty.CERTAIN,
    ...partial,
  };
}

describe("matcher V2", () => {
  it("supports an exact skill and leaves missing skills UNKNOWN", () => {
    const rows = computeRequirementAssessments({
      requirements: [
        requirement({ id: 1, sourceText: "python", skillCanonicalKey: "python" }),
        requirement({ id: 2, sourceText: "kafka", skillCanonicalKey: "kafka" }),
      ],
      claims: [
        {
          id: 10,
          evidenceId: 100,
          runId: 1,
          claimType: "SKILL",
          normalizedValue: "python",
          polarity: "POSITIVE",
          viaAlias: false,
        },
      ],
    });

    expect(rows.find((row) => row.jobRequirementId === 1)?.supportState).toBe(
      RequirementSupportState.SUPPORTED,
    );
    expect(rows.find((row) => row.jobRequirementId === 2)?.supportState).toBe(
      RequirementSupportState.UNKNOWN,
    );
  });

  it("marks a negated skill CONTRADICTED instead of SUPPORTED", () => {
    const rows = computeRequirementAssessments({
      requirements: [
        requirement({ id: 1, sourceText: "django", skillCanonicalKey: "django" }),
      ],
      claims: [
        {
          id: 11,
          evidenceId: 100,
          runId: 1,
          claimType: "SKILL",
          normalizedValue: "django",
          polarity: "NEGATED",
          viaAlias: false,
        },
      ],
    });

    expect(rows[0]?.supportState).toBe(RequirementSupportState.CONTRADICTED);
  });

  it("does not treat React evidence as React Native", () => {
    const rows = computeRequirementAssessments({
      requirements: [
        requirement({
          id: 1,
          sourceText: "React Native",
          skillCanonicalKey: "react_native",
          normalizedValue: "react_native",
        }),
      ],
      claims: [
        {
          id: 12,
          evidenceId: 100,
          runId: 1,
          claimType: "SKILL",
          normalizedValue: "react",
          polarity: "POSITIVE",
          viaAlias: false,
        },
      ],
    });

    expect(rows[0]?.supportState).toBe(RequirementSupportState.UNKNOWN);
  });

  it("leaves ambiguous requirements UNSUPPORTED", () => {
    const rows = computeRequirementAssessments({
      requirements: [
        {
          id: 3,
          stableKey: "jobDescription:culture",
          sourceField: "jobDescription",
          sourceText: "We value curiosity.",
          category: JobRequirementCategory.AMBIGUOUS,
          normalizedValue: "we value curiosity.",
          skillCanonicalKey: null,
          uncertainty: JobRequirementUncertainty.AMBIGUOUS,
        },
      ],
      claims: [],
    });

    expect(rows[0]?.supportState).toBe(RequirementSupportState.UNSUPPORTED);
  });

  it("stores a non-verbatim meets citation as unknown", () => {
    const [draft] = computeRequirementAssessments({
      requirements: [
        requirement({
          id: 1,
          sourceText: "TypeScript",
          sourceField: "primarySkills",
          category: JobRequirementCategory.REQUIRED,
          normalizedValue: "typescript",
          skillCanonicalKey: "typescript",
        }),
      ],
      claims: [
        {
          id: 9,
          evidenceId: 3,
          runId: 1,
          claimType: "SKILL",
          normalizedValue: "typescript",
          polarity: "POSITIVE",
          viaAlias: false,
        },
      ],
    });
    expect(withVerbatimCitation({
      draft: draft!,
      sourceText: "Built services with TypeScript.",
      quote: "expert in Go",
    }).supportState).toBe(RequirementSupportState.UNKNOWN);
  });
});
