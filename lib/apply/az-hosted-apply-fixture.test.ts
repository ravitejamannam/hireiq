import { describe, expect, it } from "vitest";

import { hashSecureToken } from "@/lib/auth/secure-token";
import { hostedApplyFixtureIsConsistent } from "@/lib/apply/az-hosted-apply-fixture";

const origin = "http://localhost:4010";
const token = "fixture-token";
const hash = hashSecureToken(token);
const snapshot = `${origin}/apply/${token}`;

describe("hosted apply fixture consistency", () => {
  it("accepts one matching unrevoked token", () => {
    expect(
      hostedApplyFixtureIsConsistent({
        snapshot,
        origin,
        unrevokedTokenHashes: [hash],
      }),
    ).toBe(true);
  });

  it("rejects a different origin", () => {
    expect(
      hostedApplyFixtureIsConsistent({
        snapshot: "http://localhost:4000/apply/fixture-token",
        origin,
        unrevokedTokenHashes: [hash],
      }),
    ).toBe(false);
  });

  it("rejects a malformed path, query, fragment, or trailing slash", () => {
    for (const bad of [
      `${origin}/apply/fixture-token/extra`,
      `${origin}/apply/`,
      `${origin}/apply/fixture-token?x=1`,
      `${origin}/apply/fixture-token#part`,
      `${origin}/apply/fixture-token/`,
    ]) {
      expect(
        hostedApplyFixtureIsConsistent({
          snapshot: bad,
          origin,
          unrevokedTokenHashes: [hashSecureToken(bad.split("/apply/")[1]?.replace(/[/?#].*/, "") ?? "")],
        }),
      ).toBe(false);
    }
  });

  it("rejects a hash that does not match the snapshot token", () => {
    expect(
      hostedApplyFixtureIsConsistent({
        snapshot,
        origin,
        unrevokedTokenHashes: [hashSecureToken("other-token")],
      }),
    ).toBe(false);
  });

  it("rejects zero unrevoked tokens", () => {
    expect(
      hostedApplyFixtureIsConsistent({
        snapshot,
        origin,
        unrevokedTokenHashes: [],
      }),
    ).toBe(false);
  });

  it("rejects multiple unrevoked tokens", () => {
    expect(
      hostedApplyFixtureIsConsistent({
        snapshot,
        origin,
        unrevokedTokenHashes: [hash, hashSecureToken("other-token")],
      }),
    ).toBe(false);
  });
});
