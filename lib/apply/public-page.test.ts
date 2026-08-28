import { describe, expect, it } from "vitest";

import {
  assertHostedApplyPageHasNoInternalFields,
  toPublicHostedApplyPage,
} from "@/lib/apply/public-page";
import type { PublicDistributionPayload } from "@/lib/jobs/distribution/payload";

const payload: PublicDistributionPayload = {
  title: "Senior Backend Engineer",
  roleCategory: "ENGINEERING",
  experienceRange: "5-9 years",
  location: "Bengaluru",
  jobDescription: "Build services.",
  mustHaveRequirements: "SQL",
  niceToHaveRequirements: "gRPC",
  primarySkills: "Go",
  numberOfPositions: 1,
  compensationRange: "₹45L",
  applyMode: "HIREIQ_HOSTED",
  applyUrl: null,
  companyDisplayName: "Nimbus Labs",
};

describe("public hosted apply page", () => {
  it("can include a careers slug without leaking internal ids", () => {
    const page = toPublicHostedApplyPage(payload, {
      companyPublicSlug: "nimbus",
      companyIndustry: "Technology",
      companyEmployees: 120,
    });

    expect(page.companyPublicSlug).toBe("nimbus");
    expect(assertHostedApplyPageHasNoInternalFields(page)).toBe(true);
    expect(page).not.toHaveProperty("evaluationCriteria");
    expect(page).not.toHaveProperty("structuredPayload");
    expect(page).not.toHaveProperty("companyId");
    expect(page).not.toHaveProperty("jobId");
  });
});
