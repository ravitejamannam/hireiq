import { describe, expect, it } from "vitest";

import { computeMarkupFeeCents } from "@/lib/billing/markup-math";
import {
  ASSESSMENT_QUESTIONS_PER_INVITE,
  scoreAssessmentAnswers,
  selectAdaptiveMix,
} from "@/lib/assessments/assessment-math";
import { computeRequirementMatches } from "@/lib/candidates/matching/matching-engine";
import { CandidateMatchResult } from "@prisma/client";

describe("markup fee math", () => {
  it("computes fee as CTC × bps / 10000 with integer rounding", () => {
    expect(computeMarkupFeeCents(1_000_00, 1000)).toBe(10_000);
    expect(computeMarkupFeeCents(2_500_00, 2500)).toBe(62_500);
    expect(computeMarkupFeeCents(1, 1)).toBe(0);
    expect(computeMarkupFeeCents(3, 5000)).toBe(2);
  });
});

describe("assessment scoring", () => {
  it("sums weights only for correct indexes", () => {
    const { score, rows } = scoreAssessmentAnswers({
      questionIds: [1, 2, 3],
      selected: { 1: 0, 2: 1, 3: 2 },
      scoringKey: {
        "1": { correctIndex: 0, weight: 2 },
        "2": { correctIndex: 0, weight: 3 },
        "3": { correctIndex: 2, weight: 1 },
      },
    });
    expect(score).toBe(3);
    expect(rows.map((row) => row.isCorrect)).toEqual([true, false, true]);
  });
});

describe("adaptive mix", () => {
  it("returns at most the invite size with unique ids", () => {
    const questions = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      prompt: `Q${i + 1}`,
      choices: ["a", "b"],
      correctIndex: 0,
      weight: 1,
      difficulty: (["EASY", "MEDIUM", "HARD"] as const)[i % 3],
    }));
    const picked = selectAdaptiveMix(questions);
    expect(picked).toHaveLength(ASSESSMENT_QUESTIONS_PER_INVITE);
    expect(new Set(picked.map((q) => q.id)).size).toBe(picked.length);
  });
});

describe("matching UNKNOWN ≠ false", () => {
  it("marks missing skills as UNKNOWN, not unsatisfied", () => {
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

    const go = rows.find((row) => row.requirementKey.includes("go"));
    const postgres = rows.find((row) => row.requirementKey.includes("postgres"));
    const location = rows.find((row) => row.sourceField === "location");
    const mustHave = rows.find((row) => row.sourceField === "mustHaveRequirements");

    expect(go?.result).toBe(CandidateMatchResult.SATISFIED);
    expect(postgres?.result).toBe(CandidateMatchResult.UNKNOWN);
    expect(location?.result).toBe(CandidateMatchResult.UNKNOWN);
    expect(mustHave?.result).toBe(CandidateMatchResult.UNSUPPORTED);
  });
});
