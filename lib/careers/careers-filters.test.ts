import { describe, expect, it } from "vitest";

import { filterAndSortCareersRoles } from "@/lib/careers/careers-filters";
import type { PublicCareersRole } from "@/lib/careers/careers-filters";

function role(
  overrides: Partial<PublicCareersRole> & { title: string },
): PublicCareersRole {
  return {
    externalRef: "dist-1",
    distributionId: 1,
    companyName: "Nimbus",
    companyPublicSlug: "nimbus",
    location: "Bengaluru",
    employmentType: "FULL_TIME",
    employmentTypeLabel: "Full-time",
    description: "Build.",
    applyUrl: "/apply/x",
    datePosted: new Date("2026-01-02T00:00:00Z"),
    validThrough: null,
    applicationCount: null,
    ...overrides,
  };
}

describe("careers filters", () => {
  const roles = [
    role({
      title: "Backend",
      distributionId: 1,
      location: "Bengaluru",
      employmentType: "FULL_TIME",
      datePosted: new Date("2026-01-02T00:00:00Z"),
    }),
    role({
      title: "Contract designer",
      distributionId: 2,
      location: "Remote",
      employmentType: "CONTRACT",
      employmentTypeLabel: "Contract",
      datePosted: new Date("2026-01-01T00:00:00Z"),
    }),
  ];

  it("filters by location substring and employment type", () => {
    const filtered = filterAndSortCareersRoles(roles, {
      location: "remote",
      employmentType: "CONTRACT",
    });
    expect(filtered.map((r) => r.title)).toEqual(["Contract designer"]);
  });

  it("sorts by title when requested", () => {
    const sorted = filterAndSortCareersRoles(roles, { sort: "title" });
    expect(sorted.map((r) => r.title)).toEqual(["Backend", "Contract designer"]);
  });
});
