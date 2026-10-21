import { describe, expect, it } from "vitest";

import { decideIntakeMatch } from "@/lib/candidates/intake-match";
import { rememberKnownCandidate } from "@/lib/imports/import-service";
import type { KnownCandidate } from "@/lib/imports/import-preview";

function remember(
  rows: Map<string, KnownCandidate>,
  candidateId: number,
  email: string,
) {
  rememberKnownCandidate(
    rows,
    {
      candidateId,
      companyId: 10,
      name: candidateId === 1 ? "Ada" : "Bea",
      currentEmployer: null,
      erased: false,
    },
    email,
    null,
  );
}

describe("known candidate emails", () => {
  it("keeps every address so a shared email stays ambiguous", () => {
    const rows = new Map<string, KnownCandidate>();
    remember(rows, 1, "ada@example.com");
    remember(rows, 1, "shared@example.com");
    remember(rows, 2, "shared@example.com");
    const known = [...rows.values()];

    const shared = decideIntakeMatch({
      companyId: 10,
      email: "shared@example.com",
      phoneDigits: null,
      name: null,
      employer: null,
      known,
    });
    expect(shared.decision).toBe("review");

    const ada = decideIntakeMatch({
      companyId: 10,
      email: "ada@example.com",
      phoneDigits: null,
      name: null,
      employer: null,
      known,
    });
    expect(ada).toMatchObject({ decision: "attach", candidateId: 1 });
  });
});
