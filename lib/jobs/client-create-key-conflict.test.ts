import { describe, expect, it } from "vitest";

import { isClientCreateKeyConflict } from "@/lib/jobs/job-specification";

describe("client create key conflicts", () => {
  it("recognizes only the company and key unique constraint", () => {
    expect(
      isClientCreateKeyConflict({
        code: "P2002",
        meta: { target: ["companyId", "clientCreateIdempotencyKey"] },
      }),
    ).toBe(true);
    expect(
      isClientCreateKeyConflict({
        code: "P2002",
        meta: { target: ["currentPublishedSpecificationVersionId"] },
      }),
    ).toBe(false);
    expect(isClientCreateKeyConflict({ code: "P2003" })).toBe(false);
  });
});
