import { describe, expect, it } from "vitest";

import { coverageFromMatches, rankRediscovery, rediscoveryExclusion, resumeIsStale, visibleRediscoveryRows } from "@/lib/talent/rediscovery";

const now = new Date("2026-10-18T00:00:00.000Z");

function person(overrides: Partial<Parameters<typeof rediscoveryExclusion>[0]["person"]> = {}) {
  return {
    candidateId: 1,
    activeOnThisJob: false,
    withdrawn: false,
    deletionRequested: false,
    optedOut: false,
    futureRolesConsent: true,
    rejectedForThisRoleAt: null,
    latestActivityAt: now,
    resumeUpdatedAt: now,
    receivedAt: now,
    ...overrides,
  };
}

describe("talent rediscovery exclusions", () => {
  const base = { now, rejectWindowDays: 90, retentionJurisdiction: "GDPR", keyword: null as string | null };

  it("drops active, withdrawn, deletion, opt-out, missing consent, retention, and recent rejects", () => {
    expect(rediscoveryExclusion({ ...base, person: person({ activeOnThisJob: true }) })).toBe("active");
    expect(rediscoveryExclusion({ ...base, person: person({ withdrawn: true }) })).toBe("withdrawn");
    expect(rediscoveryExclusion({ ...base, person: person({ deletionRequested: true }) })).toBe("deletion");
    expect(rediscoveryExclusion({ ...base, person: person({ optedOut: true }) })).toBe("opt-out");
    expect(rediscoveryExclusion({ ...base, person: person({ futureRolesConsent: false }) })).toBe("no-consent");
    expect(rediscoveryExclusion({
      ...base,
      person: person({ receivedAt: new Date("2020-01-01T00:00:00.000Z") }),
    })).toBe("retention");
    expect(rediscoveryExclusion({
      ...base,
      person: person({ rejectedForThisRoleAt: new Date("2026-09-01T00:00:00.000Z") }),
    })).toBe("recent-reject");
    expect(rediscoveryExclusion({ ...base, person: person() })).toBeNull();
  });

  it("lets an opted-out candidate through a keyword search only", () => {
    expect(rediscoveryExclusion({
      ...base,
      keyword: "kubernetes",
      person: person({ optedOut: true }),
    })).toBeNull();
  });

  it("keeps the past-candidate list to people who still pass every exclusion", () => {
    const rows = [{ candidateId: 1, name: "Shown" }, { candidateId: 2, name: "Withdrawn" }, { candidateId: 3, name: "Hidden" }];
    const visible = visibleRediscoveryRows({
      rows,
      people: [person({ candidateId: 1 }), person({ candidateId: 2, withdrawn: true }), person({ candidateId: 3 })],
      hiddenIds: [3],
      now,
      rejectWindowDays: 90,
      retentionJurisdiction: "GDPR",
    });
    expect(visible.map((row) => row.name)).toEqual(["Shown"]);
  });

  it("ranks by matcher coverage, then recency, then a submitted interview score", () => {
    const ranked = rankRediscovery([
      { id: "older", coverage: 0.5, latestActivityAt: new Date("2026-01-01T00:00:00.000Z"), interviewScore: 5 },
      { id: "strong", coverage: 1, latestActivityAt: new Date("2026-02-01T00:00:00.000Z"), interviewScore: null },
      { id: "recent", coverage: 0.5, latestActivityAt: new Date("2026-08-01T00:00:00.000Z"), interviewScore: 2 },
      { id: "interviewed", coverage: 0.5, latestActivityAt: new Date("2026-08-01T00:00:00.000Z"), interviewScore: 4 },
    ]);
    expect(ranked.map((row) => row.id)).toEqual(["strong", "interviewed", "recent", "older"]);
    expect(coverageFromMatches([{ result: "SATISFIED" }, { result: "UNKNOWN" }])).toBe(0.5);
  });

  it("warns when the resume is older than 12 months", () => {
    expect(resumeIsStale(new Date("2025-01-01T00:00:00.000Z"), now)).toBe(true);
    expect(resumeIsStale(new Date("2026-06-01T00:00:00.000Z"), now)).toBe(false);
  });
});
