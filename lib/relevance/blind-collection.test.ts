import { describe, expect, it } from "vitest";
import { PortalRole } from "@prisma/client";

import { authConfig } from "@/auth.config";

function decide(role: string | undefined, loggedIn: boolean) {
  const nextUrl = new URL(
    "http://localhost/client/requirements/1/relevance/1",
  );
  return authConfig.callbacks.authorized({
    auth: loggedIn ? ({ user: { role } } as never) : null,
    request: { nextUrl } as never,
  });
}

describe("blind relevance route authorization", () => {
  it("denies anonymous, admin, interviewer, and non-client roles", () => {
    expect(decide(undefined, false)).toBe(false);
    for (const role of [PortalRole.ADMIN, PortalRole.INTERVIEWER, "CANDIDATE"]) {
      const result = decide(role, true);
      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBeGreaterThanOrEqual(300);
        expect(result.status).toBeLessThan(400);
        expect(result.headers.get("location")).not.toContain("/client");
      }
    }
  });

  it("allows a client", () => {
    expect(decide(PortalRole.CLIENT, true)).toBe(true);
  });
});
