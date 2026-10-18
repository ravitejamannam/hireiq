import { describe, expect, it } from "vitest";

import {
  findBiasFlags,
  findContradictions,
  groundDocument,
  jobDescriptionDocumentSchema,
  listMissingInfo,
  mergeJobDescriptionSection,
  packProposal,
  type JobDescriptionDocument,
} from "@/lib/ai/job-description-document";

const source = {
  title: "Backend engineer",
  experienceRange: "Junior, 0-2 years",
  location: "Bengaluru",
  compensationRange: null,
  mustHaveRequirements: "TypeScript",
  niceToHaveRequirements: null,
  primarySkills: "TypeScript",
  jobDescription: null,
  companyName: "Nimbus",
};

function document(overrides: Partial<JobDescriptionDocument> = {}): JobDescriptionDocument {
  return jobDescriptionDocumentSchema.parse({
    title: "Backend engineer",
    summary: "Build APIs.",
    responsibilities: ["Ship services"],
    mustHaveSkills: ["TypeScript"],
    niceToHaveSkills: [],
    experienceRange: "Junior, 0-2 years",
    location: "Bengaluru",
    workMode: "hybrid",
    compensation: null,
    benefits: [],
    hiringProcess: null,
    screeningQuestions: ["Have you shipped TypeScript?"],
    scoringRubric: [{ criterion: "TypeScript", signal: "Production services" }],
    ...overrides,
  });
}

describe("job description document", () => {
  it("rejects a document that drops required fields", () => {
    expect(jobDescriptionDocumentSchema.safeParse({ title: "Only a title" }).success).toBe(false);
  });

  it("flags biased wording and a junior role that asks for 10 years", () => {
    expect(findBiasFlags("We want a young rockstar who is a native speaker").map((flag) => flag.phrase)).toEqual([
      "rockstar",
      "young",
      "native speaker",
    ]);
    expect(
      findContradictions(
        document({
          mustHaveSkills: ["10 years of TypeScript"],
        }),
      ).join(" "),
    ).toContain("does not fit");
  });

  it("drops compensation that was not supplied and lists missing info", () => {
    const grounded = groundDocument(document({ compensation: "40 LPA", benefits: ["free lunch"] }), source);
    expect(grounded.compensation).toBeNull();
    expect(grounded.benefits).toEqual([]);
    expect(listMissingInfo(source)).toContain("Compensation");
  });

  it("rewrites one section and keeps the rest", () => {
    const next = mergeJobDescriptionSection(document(), "responsibilities", [
      "Own production services",
      "Mentor one teammate",
    ]);
    expect(next.responsibilities).toEqual(["Own production services", "Mentor one teammate"]);
    expect(next.mustHaveSkills).toEqual(["TypeScript"]);
    const packed = packProposal({
      document: next,
      source,
      controls: { tone: "startup", length: "short", india: { ctcInLpa: true, noticePeriod: true, cityOrHybrid: true } },
    });
    expect(packed.jobDescription).toContain("Own production services");
    expect(packed.boards.naukri).toContain("Backend engineer");
  });
});
