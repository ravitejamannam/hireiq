import { describe, expect, it } from "vitest";

import { DEFAULT_JD_CONTROLS } from "@/lib/ai/job-description-document";
import { jobDescriptionCacheKey } from "@/lib/ai/job-description-generator";
import { buildJobDescriptionAiInput } from "@/lib/ai/job-description-prompt";

const input = buildJobDescriptionAiInput({
  title: "Backend engineer",
  roleCategory: null,
  experienceRange: "3-5 years",
  location: "Bengaluru",
  compensationRange: null,
  targetHireDate: null,
  numberOfPositions: 1,
  mustHaveRequirements: "TypeScript",
  niceToHaveRequirements: null,
  jobDescription: null,
  evaluationCriteria: null,
  primarySkills: "TypeScript",
  structuredPayload: {},
});

describe("job description cache key", () => {
  it("changes when tone, length, or India options change", () => {
    const base = jobDescriptionCacheKey(input, DEFAULT_JD_CONTROLS);
    expect(base).not.toBe(
      jobDescriptionCacheKey(input, { ...DEFAULT_JD_CONTROLS, tone: "startup" }),
    );
    expect(base).not.toBe(
      jobDescriptionCacheKey(input, { ...DEFAULT_JD_CONTROLS, length: "short" }),
    );
    expect(base).not.toBe(
      jobDescriptionCacheKey(input, {
        ...DEFAULT_JD_CONTROLS,
        india: { ctcInLpa: true, noticePeriod: false, cityOrHybrid: false },
      }),
    );
    expect(base).toContain("");
    expect(base).not.toBe(jobDescriptionCacheKey({ ...input, title: "Designer" }, DEFAULT_JD_CONTROLS));
  });
});
