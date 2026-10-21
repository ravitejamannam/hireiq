import { describe, expect, it } from "vitest";

import { toPublicApplication, type PublicIngestionEvent } from "@/lib/api/public-application";

const at = new Date("2026-03-15T12:00:00.000Z");

function event(overrides: Partial<PublicIngestionEvent> = {}): PublicIngestionEvent {
  return {
    id: 1,
    receivedAt: at,
    status: "PROCESSED",
    sourceChannel: "MANUAL",
    externalApplicationId: null,
    ...overrides,
  };
}

function row(events: PublicIngestionEvent[]) {
  return toPublicApplication({
    id: 10,
    jobId: 4,
    name: "Fixture applicant",
    status: "CV_POOL",
    createdAt: at,
    ingestionEvents: events,
  });
}

describe("public application intake method", () => {
  it("labels csv import, inbound email, hosted apply, and manual entry", () => {
    expect(row([event({ externalApplicationId: "import:3:2" })]).intakeMethod).toBe("CSV Import");
    expect(row([event({ externalApplicationId: "inbound:8" })]).intakeMethod).toBe("Inbound Email");
    expect(row([event({ sourceChannel: "HOSTED_APPLY" })]).intakeMethod).toBe("Hosted Apply");
    expect(row([event()]).intakeMethod).toBe("Manual Entry");
  });

  it("returns Not Recorded when no event exists or the channel is unknown", () => {
    expect(row([]).source).toBeNull();
    expect(row([]).intakeMethod).toBe("Not Recorded");
    expect(row([event({ sourceChannel: "FAX", externalApplicationId: "board:1" })]).intakeMethod).toBe("Not Recorded");
  });

  it("keeps source as the highest event id while intake uses the earliest processed event", () => {
    const sameTime = new Date("2026-03-15T12:00:00.000Z");
    const result = row([
      event({ id: 9, receivedAt: sameTime, sourceChannel: "LINKEDIN", externalApplicationId: null }),
      event({ id: 3, receivedAt: sameTime, sourceChannel: "MANUAL", externalApplicationId: "import:3:2" }),
      event({
        id: 1,
        receivedAt: new Date("2026-03-14T00:00:00.000Z"),
        status: "FAILED",
        sourceChannel: "HOSTED_APPLY",
      }),
    ]);
    expect(result.source).toBe("LINKEDIN");
    expect(result.intakeMethod).toBe("CSV Import");
    expect(result).not.toHaveProperty("externalApplicationId");
  });

  it("falls back to the earliest event when none are processed", () => {
    const result = row([
      event({ id: 8, status: "FAILED", receivedAt: new Date("2026-03-16T00:00:00.000Z"), sourceChannel: "LINKEDIN" }),
      event({ id: 4, status: "RECEIVED", receivedAt: at, sourceChannel: "MANUAL", externalApplicationId: "import:4:1" }),
    ]);
    expect(result.source).toBe("LINKEDIN");
    expect(result.intakeMethod).toBe("CSV Import");
  });
});
