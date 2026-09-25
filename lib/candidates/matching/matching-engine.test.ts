import { describe, expect, it } from "vitest";
import { CandidateMatchResult } from "@prisma/client";

import { computeRequirementMatches } from "@/lib/candidates/matching/matching-engine";

describe("matcher V1 contract", () => {
  it("keeps SATISFIED / UNKNOWN / UNSUPPORTED meanings", () => {
    const rows = computeRequirementMatches({
      spec: {
        primarySkills: "Go, Postgres",
        location: "Bengaluru",
        mustHaveRequirements: "Staff engineer",
        niceToHaveRequirements: null,
      },
      claims: [
        {
          id: 1,
          evidenceId: 10,
          runId: 5,
          runCompletedAt: new Date(),
          claimType: "SKILL",
          normalizedValue: "go",
        },
      ],
    });

    expect(rows.find((row) => row.requirementKey.includes("go"))?.result).toBe(
      CandidateMatchResult.SATISFIED,
    );
    expect(rows.find((row) => row.requirementKey.includes("postgres"))?.result).toBe(
      CandidateMatchResult.UNKNOWN,
    );
    expect(rows.find((row) => row.sourceField === "mustHaveRequirements")?.result).toBe(
      CandidateMatchResult.UNSUPPORTED,
    );
  });
});
