import { describe, expect, it } from "vitest";

import { jobDescriptionDocumentSchema } from "@/lib/ai/job-description-document";
import { generateJobDescriptionFromProvider } from "@/lib/ai/job-description-generator";
import { buildJobDescriptionAiInput } from "@/lib/ai/job-description-prompt";

const live = process.env.HIREIQ_LIVE_JD === "1";

describe.skipIf(!live)("live job description generation", () => {
  it("returns a schema-valid document from OpenAI", async () => {
    const generated = await generateJobDescriptionFromProvider(
      buildJobDescriptionAiInput({
        title: "Backend engineer",
        roleCategory: "ENGINEERING",
        experienceRange: "3-5 years",
        location: "Bengaluru, hybrid",
        compensationRange: null,
        targetHireDate: null,
        numberOfPositions: 1,
        mustHaveRequirements: "TypeScript and PostgreSQL",
        niceToHaveRequirements: "GraphQL",
        jobDescription: null,
        evaluationCriteria: null,
        primarySkills: "TypeScript",
        structuredPayload: { companyName: "Nimbus", companyIndustry: "Software" },
      }),
    );
    const parsed = JSON.parse(generated.proposalJson ?? "");
    expect(jobDescriptionDocumentSchema.safeParse(parsed.document).success).toBe(true);
    expect(parsed.document.compensation).toBeNull();
  }, 35_000);
});