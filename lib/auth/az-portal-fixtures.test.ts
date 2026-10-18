import { describe, expect, it } from "vitest";

import {
  AZ_CLIENT_MEMBERSHIP_ROLE,
  clientFixtureIsReady,
  interviewerFixtureIsReady,
} from "@/lib/auth/az-portal-fixtures";

const readyClient = {
  role: "CLIENT",
  disabledAt: null,
  emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  companyId: 1,
  activeMembershipCompanyIds: [1],
};

describe("A-Z portal fixtures", () => {
  it("creates the dedicated client as a member, not a second owner", () => {
    expect(AZ_CLIENT_MEMBERSHIP_ROLE).toBe("MEMBER");
  });

  it("accepts an enabled verified client with an active company membership", () => {
    expect(clientFixtureIsReady(readyClient, 1)).toBe(true);
  });

  it("rejects a client that is disabled, unverified, or on another company", () => {
    expect(clientFixtureIsReady({ ...readyClient, disabledAt: new Date() }, 1)).toBe(false);
    expect(clientFixtureIsReady({ ...readyClient, emailVerifiedAt: null }, 1)).toBe(false);
    expect(clientFixtureIsReady({ ...readyClient, companyId: 2 }, 1)).toBe(false);
    expect(clientFixtureIsReady({ ...readyClient, activeMembershipCompanyIds: [] }, 1)).toBe(false);
    expect(clientFixtureIsReady({ ...readyClient, role: "ADMIN" }, 1)).toBe(false);
  });

  it("accepts an enabled interviewer with a profile id", () => {
    expect(
      interviewerFixtureIsReady({ role: "INTERVIEWER", disabledAt: null, interviewerId: 4 }),
    ).toBe(true);
  });

  it("rejects an interviewer who is disabled or has no profile", () => {
    expect(
      interviewerFixtureIsReady({ role: "INTERVIEWER", disabledAt: new Date(), interviewerId: 4 }),
    ).toBe(false);
    expect(
      interviewerFixtureIsReady({ role: "INTERVIEWER", disabledAt: null, interviewerId: null }),
    ).toBe(false);
  });
});
