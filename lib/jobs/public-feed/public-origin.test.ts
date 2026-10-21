import { describe, expect, it } from "vitest";

import { prefixPublicOrigin, publicCompanyJobsPath } from "@/lib/jobs/public-feed/public-job-slug";

describe("prefixPublicOrigin", () => {
  it("keeps a careers path relative until an origin is known", () => {
    expect(prefixPublicOrigin("", publicCompanyJobsPath("fixture-co"))).toBe("/c/fixture-co/jobs");
  });

  it("uses one explicit origin for the absolute careers URL", () => {
    expect(prefixPublicOrigin("https://hire.example/", publicCompanyJobsPath("fixture-co"))).toBe(
      "https://hire.example/c/fixture-co/jobs",
    );
  });

  it("does not rewrite a URL that is already absolute", () => {
    expect(prefixPublicOrigin("https://hire.example", "https://other.example/apply/token")).toBe(
      "https://other.example/apply/token",
    );
  });
});
