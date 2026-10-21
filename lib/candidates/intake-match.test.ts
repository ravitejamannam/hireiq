import { describe, expect, it } from "vitest";

import { decideIntakeMatch } from "@/lib/candidates/intake-match";
import type { KnownCandidate } from "@/lib/imports/import-preview";

function person(overrides: Partial<KnownCandidate>): KnownCandidate {
  return {
    candidateId: 1,
    companyId: 10,
    name: "Ada Lovelace",
    email: "ada@example.com",
    phoneDigits: null,
    currentEmployer: "Analytical",
    erased: false,
    ...overrides,
  };
}

describe("intake match", () => {
  it("attaches one email, reviews several, and only suggests phone or name", () => {
    const one = decideIntakeMatch({
      companyId: 10,
      email: "ada@example.com",
      phoneDigits: null,
      name: "Ada Lovelace",
      employer: "Analytical",
      known: [person({ candidateId: 4 })],
    });
    expect(one).toMatchObject({ decision: "attach", candidateId: 4 });

    const many = decideIntakeMatch({
      companyId: 10,
      email: "ada@example.com",
      phoneDigits: null,
      name: "Ada",
      employer: null,
      known: [person({ candidateId: 4 }), person({ candidateId: 5, name: "Ada Other" })],
    });
    expect(many.decision).toBe("review");

    const phone = decideIntakeMatch({
      companyId: 10,
      email: "new@example.com",
      phoneDigits: "919876543210",
      name: "Someone Else",
      employer: null,
      known: [person({ phoneDigits: "919876543210", email: "ada@example.com" })],
    });
    expect(phone.decision).toBe("create");
    expect(phone.suggestions[0]?.reason).toMatch(/phone/);

    const fuzzy = decideIntakeMatch({
      companyId: 10,
      email: null,
      phoneDigits: null,
      name: "Ada Lovelace",
      employer: "Analytical",
      known: [person({ email: null })],
    });
    expect(fuzzy.decision).toBe("create");
    expect(fuzzy.suggestions[0]?.reason).toMatch(/suggestion/);

    const otherCompany = decideIntakeMatch({
      companyId: 10,
      email: "ada@example.com",
      phoneDigits: null,
      name: "Ada",
      employer: null,
      known: [person({ companyId: 99 })],
    });
    expect(otherCompany.decision).toBe("create");
  });
});
