import { describe, expect, it } from "vitest";
import { RequirementSupportState } from "@prisma/client";

import { fitScore, recencyWeight, seniorityBand, spearman, whyNot, type FitCandidate } from "@/lib/candidates/matching/match-quality";
import { computeRequirementAssessments, explainAssessment } from "@/lib/candidates/matching/matching-engine-v2";
import { JobRequirementCategory, JobRequirementUncertainty } from "@prisma/client";

const job = { skills: ["react", "sql", "nodejs"], minYears: 4, targetYears: 6 };
const asOf = 2026;

function person(id: string, years: number, skills: Array<[string, number]>): FitCandidate {
  return { id, yearsExperience: years, skills: skills.map(([name, lastUsedYear]) => ({ name, lastUsedYear })) };
}

/**
 * These 30 pairs are a worksheet, not a human gold set.
 * The previous Spearman number was computed against an order written
 * by the same agent that wrote the scorer. That number does not count.
 * Ranks belong in eval/matcher-human-rank.csv, filled by a person.
 */
const WORKSHEET: FitCandidate[] = [
  person("a", 6, [["React", 2025], ["SQL", 2025], ["Node.js", 2025]]),
  person("b", 6, [["ReactJS", 2025], ["PostgreSQL", 2024], ["Node", 2025]]),
  person("c", 7, [["React", 2024], ["SQL", 2024], ["Node.js", 2023]]),
  person("d", 5, [["React", 2025], ["SQL", 2025], ["Node.js", 2020]]),
  person("e", 5, [["React", 2025], ["SQL", 2022], ["Node.js", 2025]]),
  person("f", 4, [["React", 2025], ["MySQL", 2025], ["Node.js", 2024]]),
  person("g", 8, [["React", 2023], ["SQL", 2025], ["Node.js", 2025]]),
  person("h", 6, [["React", 2025], ["SQL", 2025]]),
  person("i", 6, [["React", 2025], ["Node.js", 2025]]),
  person("j", 6, [["React", 2018], ["SQL", 2025], ["Node.js", 2025]]),
  person("k", 6, [["React", 2025], ["SQL", 2017], ["Node.js", 2025]]),
  person("l", 6, [["React", 2022], ["SQL", 2022], ["Node.js", 2022]]),
  person("m", 3, [["React", 2024], ["SQL", 2024], ["Node.js", 2024]]),
  person("n", 12, [["React", 2025], ["SQL", 2025], ["Node.js", 2025]]),
  person("o", 2, [["React", 2025], ["SQL", 2025], ["Node.js", 2025]]),
  person("p", 6, [["Vue", 2025], ["SQL", 2025], ["Node.js", 2025]]),
  person("q", 6, [["React", 2025], ["Python", 2025], ["Node.js", 2025]]),
  person("r", 6, [["React", 2025]]),
  person("s", 6, [["SQL", 2025], ["Node.js", 2025]]),
  person("t", 10, [["React", 2016], ["SQL", 2016], ["Node.js", 2016]]),
  person("u", 4, [["React", 2020], ["SQL", 2020]]),
  person("v", 5, [["Node.js", 2025]]),
  person("w", 1, [["React", 2025], ["SQL", 2025]]),
  person("x", 0, [["React", 2025], ["SQL", 2025], ["Node.js", 2025]]),
  person("y", 8, [["Java", 2025]]),
  person("z", 6, [["Python", 2025]]),
  person("aa", 4, [["SQL", 2025]]),
  person("ab", 15, [["React", 2014]]),
  person("ac", 6, []),
  person("ad", 0, []),
];

describe("match quality", () => {
  it("treats ReactJS as React, infers SQL from Postgres, and discounts an 8-year-old skill", () => {
    const reactJs = WORKSHEET.find((row) => row.id === "b");
    const missingNode = WORKSHEET.find((row) => row.id === "h");
    expect(reactJs && fitScore(reactJs, job, asOf)).toBeGreaterThan(0.7);
    expect(recencyWeight(2018, 2026)).toBeCloseTo(0.25, 5);
    expect(seniorityBand(6)).toBe("senior");
    expect(missingNode && whyNot(missingNode, job, asOf).join(" ")).toMatch(/node/i);
  });

  it("does not treat the agent worksheet order as a human gold ranking", () => {
    expect(WORKSHEET).toHaveLength(30);
    expect(spearman([1, 2], [1, 2])).toBe(1);
  });

  it("quotes evidence and explains a miss", () => {
    const rows = computeRequirementAssessments({
      requirements: [
        {
          id: 1,
          stableKey: "primarySkills:sql",
          sourceField: "primarySkills",
          sourceText: "SQL",
          category: JobRequirementCategory.REQUIRED,
          normalizedValue: "sql",
          skillCanonicalKey: "sql",
          uncertainty: JobRequirementUncertainty.CERTAIN,
        },
      ],
      claims: [
        {
          id: 3,
          evidenceId: 9,
          runId: 1,
          claimType: "SKILL",
          normalizedValue: "postgresql",
          polarity: "POSITIVE",
          viaAlias: false,
        },
      ],
    });
    expect(rows[0]?.supportState).toBe(RequirementSupportState.SUPPORTED);
    const why = explainAssessment({
      supportState: RequirementSupportState.SUPPORTED,
      reasonCode: rows[0]!.reasonCode,
      sourceText: "SQL",
      category: JobRequirementCategory.REQUIRED,
      quote: "PostgreSQL",
    });
    expect(why.why).toContain("PostgreSQL");
    const miss = explainAssessment({
      supportState: RequirementSupportState.UNKNOWN,
      reasonCode: "NO_SUPPORTING_CLAIM",
      sourceText: "Kubernetes",
      category: JobRequirementCategory.REQUIRED,
    });
    expect(miss.gap).toMatch(/Kubernetes/);
  });
});
