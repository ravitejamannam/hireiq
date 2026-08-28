import { describe, expect, it } from "vitest";

import {
  bulletsFromText,
  inferSeniorityLevel,
  resolveJobPostingView,
} from "@/lib/jobs/job-posting-view";

describe("job posting view", () => {
  it("splits must-haves into bullets", () => {
    expect(
      bulletsFromText("5+ years backend; distributed systems depth; SQL mastery"),
    ).toEqual([
      "5+ years backend",
      "distributed systems depth",
      "SQL mastery",
    ]);
  });

  it("infers senior from title and experience range", () => {
    expect(
      inferSeniorityLevel({
        title: "Senior Backend Engineer",
        companyName: "Nimbus",
        experienceRange: "5-9 years",
        location: null,
        numberOfPositions: 1,
        compensationRange: null,
        jobDescription: null,
        mustHaveRequirements: null,
        niceToHaveRequirements: null,
        primarySkills: null,
      }),
    ).toBe("SENIOR");
  });

  it("fills every board section from a short spec", () => {
    const view = resolveJobPostingView(
      {
        title: "Nimbus Labs: Senior Backend Engineer",
        companyName: "Nimbus Labs",
        companyIndustry: "Technology",
        companyEmployees: 120,
        location: "Bengaluru (Hybrid)",
        experienceRange: "5-9 years",
        numberOfPositions: 1,
        compensationRange: "₹45L – ₹65L",
        jobDescription: "Own platform services and scale multi-tenant infra.",
        mustHaveRequirements: "5+ years backend; SQL mastery",
        niceToHaveRequirements: "gRPC",
        primarySkills: "Go, PostgreSQL, Kubernetes",
      },
      "2d ago",
    );
    expect(view.title).toBe("Senior Backend Engineer");
    expect(view.employmentTypeLabel).toBe("Full-time");
    expect(view.seniorityLevelLabel).toBe("Senior");
    expect(view.responsibilities.length).toBeGreaterThan(2);
    expect(view.requirements.length).toBeGreaterThan(1);
    expect(view.benefits.some((item) => item.includes("₹45L"))).toBe(true);
    expect(view.aboutCompany).toMatch(/Nimbus Labs/);
    expect(view.skills).toEqual(["Go", "PostgreSQL", "Kubernetes"]);
    expect(view.industry).toBe("Technology");
    expect(view.companySize).toBe("~120 people");
  });

  it("uses authored posting sections when present", () => {
    const view = resolveJobPostingView(
      {
        title: "AI Engineer",
        companyName: "Congruent",
        location: "Remote",
        experienceRange: "3-6 years",
        numberOfPositions: 1,
        compensationRange: "₹25L-30L",
        jobDescription:
          "You build the services, APIs, and evaluation harness around the agent.",
        mustHaveRequirements: "Strong backend engineering experience",
        niceToHaveRequirements: null,
        primarySkills: "PyTorch, LoRA, LLM Fine-tuning",
        structuredPayload: {
          schemaVersion: 2,
          employmentType: "FULL_TIME",
          seniorityLevel: "INTERMEDIATE",
          responsibilities: ["Design and build backend services"],
          requirements: ["Hands-on production experience with AWS or Azure"],
          benefits: ["Competitive salary and a fast, respectful hiring process"],
          aboutCompany: "Congruent ships legal AI for enterprise teams.",
        },
      },
      "2d ago",
    );
    expect(view.responsibilities).toEqual([
      "Design and build backend services",
    ]);
    expect(view.requirements).toEqual([
      "Hands-on production experience with AWS or Azure",
    ]);
    expect(view.benefits[0]).toMatch(/Competitive salary/);
    expect(view.aboutCompany).toMatch(/legal AI/);
    expect(view.skills).toEqual(["PyTorch", "LoRA", "LLM Fine-tuning"]);
  });
});
