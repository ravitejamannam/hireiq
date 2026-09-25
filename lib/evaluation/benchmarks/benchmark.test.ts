import { describe, expect, it } from "vitest";
import {
  CandidateClaimPolarity,
  JobRequirementCategory,
  JobRequirementUncertainty,
  RequirementSupportState,
} from "@prisma/client";

import { extractClaimsDeterministically } from "@/lib/candidates/intelligence/deterministic-extractor";
import { computeRequirementMatches } from "@/lib/candidates/matching/matching-engine";
import { computeRequirementAssessments } from "@/lib/candidates/matching/matching-engine-v2";
import { extractJobRequirements } from "@/lib/jobs/intelligence/job-intelligence-extractor";
import { canonicalSkillKey } from "@/lib/ontology/skill-alias";

describe("HireIQ intelligence benchmark", () => {
  it("exact skill: V2 supports a direct Python mention", () => {
    const claims = extractClaimsDeterministically("Used Python in production.");
    const python = claims.find((claim) => claim.normalizedValue === "python");
    expect(python?.polarity).toBe(CandidateClaimPolarity.POSITIVE);
  });

  it("alias: JS maps to javascript", () => {
    expect(canonicalSkillKey("JS")).toBe("javascript");
  });

  it("false friend: React evidence does not satisfy React Native", () => {
    const claims = extractClaimsDeterministically("Five years of React.");
    const rows = computeRequirementAssessments({
      requirements: [
        {
          id: 1,
          stableKey: "primarySkills:react_native",
          sourceField: "primarySkills",
          sourceText: "React Native",
          category: JobRequirementCategory.REQUIRED,
          normalizedValue: "react_native",
          skillCanonicalKey: "react_native",
          uncertainty: JobRequirementUncertainty.CERTAIN,
        },
      ],
      claims: claims
        .filter((claim) => claim.claimType === "SKILL")
        .map((claim, index) => ({
          id: index + 1,
          evidenceId: 1,
          runId: 1,
          claimType: "SKILL" as const,
          normalizedValue: claim.normalizedValue,
          polarity: claim.polarity ?? "POSITIVE",
          viaAlias: false,
        })),
    });
    expect(rows[0]?.supportState).toBe(RequirementSupportState.UNKNOWN);
  });

  it("negation: V1 can still SATISFY Django from 'not Django'; V2 must not", () => {
    const text = "Used Python but not Django.";
    const v1 = computeRequirementMatches({
      spec: {
        primarySkills: "Django",
        location: null,
        mustHaveRequirements: null,
        niceToHaveRequirements: null,
      },
      claims: [
        {
          id: 1,
          evidenceId: 1,
          runId: 1,
          runCompletedAt: new Date(),
          claimType: "SKILL",
          normalizedValue: "django",
        },
      ],
    });
    expect(v1[0]?.result).toBe("SATISFIED");

    const extracted = extractClaimsDeterministically(text);
    const v2 = computeRequirementAssessments({
      requirements: [
        {
          id: 1,
          stableKey: "primarySkills:django",
          sourceField: "primarySkills",
          sourceText: "Django",
          category: JobRequirementCategory.REQUIRED,
          normalizedValue: "django",
          skillCanonicalKey: "django",
          uncertainty: JobRequirementUncertainty.CERTAIN,
        },
      ],
      claims: extracted.map((claim, index) => ({
        id: index + 1,
        evidenceId: 1,
        runId: 1,
        claimType: "SKILL" as const,
        normalizedValue: claim.normalizedValue,
        polarity: claim.polarity ?? "POSITIVE",
        viaAlias: false,
      })),
    });
    expect(v2[0]?.supportState).toBe(RequirementSupportState.CONTRADICTED);
  });

  it("missing evidence stays UNKNOWN", () => {
    const rows = computeRequirementAssessments({
      requirements: [
        {
          id: 1,
          stableKey: "primarySkills:kafka",
          sourceField: "primarySkills",
          sourceText: "Kafka",
          category: JobRequirementCategory.REQUIRED,
          normalizedValue: "kafka",
          skillCanonicalKey: "kafka",
          uncertainty: JobRequirementUncertainty.CERTAIN,
        },
      ],
      claims: [],
    });
    expect(rows[0]?.supportState).toBe(RequirementSupportState.UNKNOWN);
  });

  it("keyword stuffing does not create extra requirements from a JD paragraph", () => {
    const rows = extractJobRequirements({
      title: "Engineer",
      primarySkills: "Python",
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription:
        "Python Python Python Python we also mention Django Kafka Kubernetes AWS in a marketing paragraph about the industry.",
      evaluationCriteria: null,
    });
    const required = rows.filter((row) => row.category === JobRequirementCategory.REQUIRED);
    expect(required).toHaveLength(1);
    expect(required[0]?.normalizedValue).toBe("python");
  });

  it("sparse evidence yields no invented claims", () => {
    expect(extractClaimsDeterministically("Hello.")).toEqual([]);
  });
});
