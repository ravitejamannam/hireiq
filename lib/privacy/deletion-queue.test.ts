import { describe, expect, it } from "vitest";

import { DELETION_CEILING_DAYS, DELETION_TARGET_DAYS, deletionCeilingAt, deletionIsOverdue, deletionPastAim, deletionTargetAt } from "@/lib/privacy/deletion-queue";
import { AUTH_RATE_LIMITS } from "@/lib/auth/rate-limit";

describe("deletion deadline", () => {
  it("aims for two weeks and raises the overdue alarm only at the 90-day ceiling", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const aim = deletionTargetAt(created);
    const ceiling = deletionCeilingAt(created);
    expect(DELETION_TARGET_DAYS).toBe(14);
    expect(DELETION_CEILING_DAYS).toBe(90);
    expect(aim.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(ceiling.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(deletionPastAim({ createdAt: created, status: "QUEUED", now: new Date(aim.getTime() + 1) })).toBe(true);
    expect(deletionIsOverdue({ createdAt: created, status: "QUEUED", now: new Date(aim.getTime() + 1) })).toBe(false);
    expect(deletionIsOverdue({ createdAt: created, status: "QUEUED", now: ceiling })).toBe(false);
    expect(deletionIsOverdue({ createdAt: created, status: "QUEUED", now: new Date(ceiling.getTime() + 1) })).toBe(true);
    expect(deletionIsOverdue({ createdAt: created, status: "COMPLETED", now: new Date(ceiling.getTime() + 1) })).toBe(false);
  });
});

describe("magic link limits", () => {
  it("caps requests per email and per IP inside one hour", () => {
    expect(AUTH_RATE_LIMITS.portalMagicLinkEmail).toEqual({ windowMs: 60 * 60 * 1000, max: 5 });
    expect(AUTH_RATE_LIMITS.portalMagicLinkIp).toEqual({ windowMs: 60 * 60 * 1000, max: 10 });
  });
});
