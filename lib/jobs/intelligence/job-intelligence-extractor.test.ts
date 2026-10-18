import { describe, expect, it } from "vitest";
import { JobRequirementCategory } from "@prisma/client";

import { extractJobRequirements } from "@/lib/jobs/intelligence/job-intelligence-extractor";

describe("job intelligence extractor", () => {
  it("treats primary skills as required and location as a hard constraint", () => {
    const rows = extractJobRequirements({
      title: "Backend Engineer",
      primarySkills: "Python, PostgreSQL",
      mustHaveRequirements: null,
      niceToHaveRequirements: "Kafka",
      location: "Bengaluru",
      experienceRange: "5+ years",
      jobDescription: null,
      evaluationCriteria: null,
    });

    expect(rows.find((row) => row.normalizedValue === "python")?.category).toBe(
      JobRequirementCategory.REQUIRED,
    );
    expect(rows.find((row) => row.sourceField === "location")?.category).toBe(
      JobRequirementCategory.HARD_CONSTRAINT,
    );
    expect(rows.find((row) => row.normalizedValue === "kafka")?.category).toBe(
      JobRequirementCategory.PREFERRED,
    );
    expect(rows.find((row) => row.sourceField === "experienceRange")?.category).toBe(
      JobRequirementCategory.CONSTRAINT,
    );
  });

  it("does not promote an arbitrary JD sentence to a hard requirement", () => {
    const rows = extractJobRequirements({
      title: "Engineer",
      primarySkills: null,
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: "We are a growing team that values curiosity and kindness.",
      evaluationCriteria: null,
    });

    expect(rows.every((row) => row.category !== JobRequirementCategory.REQUIRED)).toBe(
      true,
    );
    expect(rows.some((row) => row.category === JobRequirementCategory.AMBIGUOUS)).toBe(
      true,
    );
  });

  it("marks a responsibility-like JD sentence as RESPONSIBILITY", () => {
    const rows = extractJobRequirements({
      title: "Engineer",
      primarySkills: null,
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: "Design and operate production backend services with on-call ownership.",
      evaluationCriteria: null,
    });

    expect(rows[0]?.category).toBe(JobRequirementCategory.RESPONSIBILITY);
  });

  it("keeps a long must-have sentence ambiguous instead of inventing a skill", () => {
    const rows = extractJobRequirements({
      title: "Engineer",
      primarySkills: null,
      mustHaveRequirements:
        "Someone who has thrived in messy organizations and can influence without authority.",
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: null,
      evaluationCriteria: null,
    });

    expect(rows[0]?.category).toBe(JobRequirementCategory.AMBIGUOUS);
  });

  it("turns rubric criteria and screening questions into required skills", () => {
    const rows = extractJobRequirements({
      title: "Engineer",
      primarySkills: null,
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: null,
      evaluationCriteria: null,
      screeningQuestions: ["Have you shipped TypeScript?"],
      rubricCriteria: ["PostgreSQL"],
    });

    expect(rows.find((row) => row.sourceField === "scoringRubric")?.category).toBe(
      JobRequirementCategory.REQUIRED,
    );
    expect(rows.find((row) => row.sourceField === "screeningQuestions")?.normalizedValue).toBe(
      "typescript",
    );
  });
});
