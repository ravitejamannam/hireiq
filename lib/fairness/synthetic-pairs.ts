import { computeRequirementMatches } from "@/lib/candidates/matching/matching-engine";
import { coverageFromMatches } from "@/lib/talent/rediscovery";
import type { EligibleMatchingClaim } from "@/lib/candidates/matching/matching-types";

export const SYNTHETIC_SCORE_THRESHOLD = 0;

const CLAIMS: EligibleMatchingClaim[] = [{
  id: 1,
  evidenceId: 1,
  runId: 1,
  runCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
  claimType: "SKILL",
  normalizedValue: "golang",
}];

export const SYNTHETIC_PAIRS = [
  ["Rahul Sharma, IIT Delhi, 5 years of Go", "Priya Sharma, IIT Delhi, 5 years of Go"],
  ["Rahul Sharma, IIT Delhi, 5 years of Go", "Rahul Sharma, a tier-3 college, 5 years of Go"],
] as const;

export function matcherCoverage(resumeText: string) {
  const matches = computeRequirementMatches({
    spec: {
      primarySkills: "Go",
      location: null,
      mustHaveRequirements: "5 years of Go",
      niceToHaveRequirements: null,
      resumeText,
    },
    claims: CLAIMS,
  });
  return coverageFromMatches(matches);
}

export function compareSyntheticPairs(score: (resumeText: string) => number, threshold = SYNTHETIC_SCORE_THRESHOLD) {
  return SYNTHETIC_PAIRS.map(([left, right]) => {
    const delta = Math.abs(score(left) - score(right));
    return { left, right, delta, flagged: delta > threshold };
  });
}
