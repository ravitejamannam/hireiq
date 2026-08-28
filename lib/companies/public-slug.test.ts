import { describe, expect, it } from "vitest";

import {
  isValidPublicSlug,
  publicCareersPath,
  slugifyCompanyName,
} from "@/lib/companies/public-slug";

describe("company public slug", () => {
  it("slugifies a company name without punctuation", () => {
    expect(slugifyCompanyName("Nimbus Labs")).toBe("nimbus-labs");
    expect(slugifyCompanyName("  Acme & Co.  ")).toBe("acme-co");
  });

  it("falls back when the name has no letters", () => {
    expect(slugifyCompanyName("***")).toBe("company");
  });

  it("rejects unsafe path segments", () => {
    expect(isValidPublicSlug("nimbus")).toBe(true);
    expect(isValidPublicSlug("nimbus-labs")).toBe(true);
    expect(isValidPublicSlug("../admin")).toBe(false);
    expect(isValidPublicSlug("Nimbus")).toBe(false);
    expect(isValidPublicSlug("")).toBe(false);
  });

  it("builds the public careers path", () => {
    expect(publicCareersPath("nimbus")).toBe("/careers/nimbus");
  });
});
