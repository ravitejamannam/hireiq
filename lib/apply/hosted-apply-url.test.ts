import { describe, expect, it } from "vitest";

import {
  hostedApplyPathFromSnapshot,
  publicAbsoluteApplyUrl,
} from "@/lib/apply/hosted-apply-url";

describe("hosted apply URLs", () => {
  it("keeps the token and drops a mismatched APP_URL origin", () => {
    expect(
      hostedApplyPathFromSnapshot(
        "http://localhost:3000/apply/26dez-TgBFRH5AEUtjUbFY4pR2GpXXl8QacwABbA78s",
      ),
    ).toBe("/apply/26dez-TgBFRH5AEUtjUbFY4pR2GpXXl8QacwABbA78s");
  });

  it("rebuilds an absolute URL on the live origin", () => {
    expect(
      publicAbsoluteApplyUrl(
        "http://localhost:3000/apply/abcToken",
        "http://localhost:4000",
      ),
    ).toBe("http://localhost:4000/apply/abcToken");
  });

  it("accepts a path already on this host", () => {
    expect(hostedApplyPathFromSnapshot("/apply/abcToken")).toBe("/apply/abcToken");
  });

  it("rejects non-apply URLs", () => {
    expect(hostedApplyPathFromSnapshot("http://localhost:3000/jobs/1")).toBe(
      null,
    );
  });
});
