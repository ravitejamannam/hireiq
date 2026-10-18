import { describe, expect, it } from "vitest";
import { CandidateMatchResult } from "@prisma/client";

import { computeRequirementMatches } from "@/lib/candidates/matching/matching-engine";

describe("matcher V1 contract", () => {
  it("counts years and a named skill from the resume, and location from the profile", () => {
    const rows = computeRequirementMatches({
      spec: {
        primarySkills: null,
        location: "Bengaluru (Hybrid)",
        mustHaveRequirements: "5–9 years building backend systems in production.",
        niceToHaveRequirements: "gRPC or event-driven architecture in production.",
        resumeText: "Skills: Go, Kubernetes, gRPC, Postgres\n9 years building payment platforms at scale.",
        profileLocation: "Bengaluru",
      },
      claims: [],
    });
    expect(rows.find((row) => row.requirementKey.startsWith("mustHaveRequirements:years"))?.result).toBe(
      CandidateMatchResult.SATISFIED,
    );
    expect(rows.find((row) => /grpc/i.test(row.requirementKey))?.result).toBe(
      CandidateMatchResult.SATISFIED,
    );
    expect(rows.find((row) => row.sourceField === "location")?.reasonCode).toContain("FROM_PROFILE");
    const split = computeRequirementMatches({
      spec: {
        primarySkills: null,
        location: null,
        mustHaveRequirements: "Strong distributed systems and SQL depth.",
        niceToHaveRequirements: null,
        resumeText: "Skills: Postgres",
      },
      claims: [],
    });
    const sql = split.find((row) => /sql/i.test(row.requirementKey));
    const systems = split.find((row) => /distributed/i.test(row.requirementKey));
    expect(sql?.result).toBe(CandidateMatchResult.SATISFIED);
    expect(sql?.reasonCode).toContain("INFERRED:postgres");
    expect(systems?.result).toBe(CandidateMatchResult.UNKNOWN);
  });

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
      CandidateMatchResult.UNKNOWN,
    );
  });

  it("matches a rubric skill and a screening question against resume claims", () => {
    const rows = computeRequirementMatches({
      spec: {
        primarySkills: null,
        location: null,
        mustHaveRequirements: null,
        niceToHaveRequirements: null,
        screeningQuestions: ["Have you shipped TypeScript in production?"],
        rubricCriteria: ["PostgreSQL"],
      },
      claims: [
        {
          id: 2,
          evidenceId: 11,
          runId: 5,
          runCompletedAt: new Date(),
          claimType: "SKILL",
          normalizedValue: "typescript",
        },
      ],
    });

    expect(rows.find((row) => row.sourceField === "screeningQuestions")?.result).toBe(
      CandidateMatchResult.SATISFIED,
    );
    expect(rows.find((row) => row.sourceField === "scoringRubric")?.result).toBe(
      CandidateMatchResult.UNKNOWN,
    );
  });
});
