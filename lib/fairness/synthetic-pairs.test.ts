import { describe, expect, it } from "vitest";

import { MATCHER_VERSION } from "@/lib/candidates/matching/matching-versions";
import { compareSyntheticPairs, matcherCoverage } from "@/lib/fairness/synthetic-pairs";

describe(`synthetic pair check (${MATCHER_VERSION})`, () => {
  it("does not change coverage when only the name, gender signal, or college changes", () => {
    const results = compareSyntheticPairs(matcherCoverage);
    expect(results.every((result) => result.flagged === false)).toBe(true);
  });

  it("flags a scorer that treats a college name as a skill", () => {
    const results = compareSyntheticPairs((text) => (text.includes("IIT") ? 1 : 0));
    expect(results.some((result) => result.flagged)).toBe(true);
  });
});
