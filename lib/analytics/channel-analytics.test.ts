import { describe, expect, it } from "vitest";

import { buildChannelReport, channelDateRange, classifyIntakeSource, intakeMethod, attributionEvent, type ChannelApplication, type ChannelEvent } from "@/lib/analytics/channel-analytics";
import { channelAnalyticsWhere } from "@/lib/analytics/channel-analytics-service";
import { sourceQuality } from "@/lib/analytics/recruiter-analytics";

function application(overrides: Partial<ChannelApplication> = {}): ChannelApplication {
  return {
    applicationId: 1,
    candidateId: 1,
    companyId: 7,
    createdAt: new Date("2026-03-15T12:00:00.000Z"),
    status: "CV_POOL",
    consentAt: null,
    interviewCount: 0,
    boardSource: null,
    events: [
      {
        id: 1,
        receivedAt: new Date("2026-03-15T12:00:00.000Z"),
        status: "PROCESSED",
        sourceChannel: "HOSTED_APPLY",
        externalApplicationId: null,
        distributionId: 4,
      },
    ],
    ...overrides,
  };
}

describe("channel analytics", () => {
  it("scopes the query to one company", () => {
    expect(channelAnalyticsWhere(7)).toEqual({ companyId: 7 });
    expect(channelDateRange("2026-03-20", "2026-03-01").error).toMatch(/after/);
  });
  it("counts each application once and does not treat manual intake as the source", () => {
    const report = buildChannelReport({
      companyId: 7,
      applications: [
        application({
          applicationId: 1,
          candidateId: 9,
          events: [
            {
              id: 2,
              receivedAt: new Date("2026-03-15T12:00:00.000Z"),
              status: "PROCESSED",
              sourceChannel: "MANUAL",
              externalApplicationId: "import:3:2",
              distributionId: null,
            },
            {
              id: 1,
              receivedAt: new Date("2026-03-16T12:00:00.000Z"),
              status: "PROCESSED",
              sourceChannel: "LINKEDIN",
              externalApplicationId: null,
              distributionId: null,
            },
          ],
        }),
        application({
          applicationId: 2,
          candidateId: 9,
          status: "HIRED",
          consentAt: new Date("2026-03-15T13:00:00.000Z"),
          interviewCount: 2,
          boardSource: "NAUKRI",
          events: [
            {
              id: 3,
              receivedAt: new Date("2026-03-15T12:00:00.000Z"),
              status: "PROCESSED",
              sourceChannel: "MANUAL",
              externalApplicationId: "inbound:8",
              distributionId: null,
            },
          ],
        }),
        application({ applicationId: 3, candidateId: 10, companyId: 8 }),
        application({
          applicationId: 4,
          candidateId: 11,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          events: [],
        }),
      ],
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-15T00:00:00.000Z"),
    });

    expect(report.totals).toEqual({ applications: 2, candidates: 1 });
    expect(report.rows.map((row) => row.intake)).toEqual(["CSV Import", "Inbound Email"]);
    const csv = report.rows[0]!;
    expect(csv).toMatchObject({ applications: 1, candidates: 1, consented: 0, hires: 0, recordedBoardSource: 0 });
    expect(report.rows[1]).toMatchObject({
      applications: 1,
      consented: 1,
      interviews: 1,
      hires: 1,
      recordedBoardSource: 1,
      advanced: 1,
    });
    expect(report.unavailable.views).toMatch(/not recorded/);
    expect(report.unavailable.cost).toMatch(/not recorded/);
  });

  it("includes the end day and excludes the next day", () => {
    const report = buildChannelReport({
      companyId: 7,
      from: new Date("2026-03-15T00:00:00.000Z"),
      to: new Date("2026-03-15T00:00:00.000Z"),
      applications: [
        application({ createdAt: new Date("2026-03-15T23:59:00.000Z") }),
        application({ applicationId: 2, createdAt: new Date("2026-03-16T00:00:00.000Z") }),
      ],
    });
    expect(report.totals.applications).toBe(1);
  });

  it("returns an empty report without inventing a source", () => {
    const report = buildChannelReport({ companyId: 7, applications: [] });
    expect(report.rows).toEqual([]);
    expect(report.totals.applications).toBe(0);
  });

  it("classifies intake the same way for the channel table and the sources list", () => {
    const cases: Array<{ event: ChannelEvent | undefined; label: string }> = [
      { event: event({ sourceChannel: "MANUAL", externalApplicationId: "import:3:2" }), label: "CSV Import" },
      { event: event({ sourceChannel: "MANUAL", externalApplicationId: "inbound:8" }), label: "Inbound Email" },
      { event: event({ sourceChannel: "HOSTED_APPLY", externalApplicationId: null }), label: "Hosted Apply" },
      { event: event({ sourceChannel: "MANUAL", externalApplicationId: null }), label: "Manual Entry" },
      { event: event({ sourceChannel: "LINKEDIN", externalApplicationId: "li-44" }), label: "LinkedIn" },
      { event: undefined, label: "Not Recorded" },
      { event: event({ sourceChannel: "FAX", externalApplicationId: "board:1" }), label: "Not Recorded" },
    ];
    for (const item of cases) {
      expect(classifyIntakeSource(item.event)).toBe(item.label);
      expect(intakeMethod(item.event)).toBe(item.label);
    }

    const events: ChannelEvent[] = [
      event({
        receivedAt: new Date("2026-03-15T12:00:00.000Z"),
        sourceChannel: "MANUAL",
        externalApplicationId: "import:3:2",
      }),
      event({
        receivedAt: new Date("2026-03-16T12:00:00.000Z"),
        sourceChannel: "LINKEDIN",
        externalApplicationId: "inbound:8",
      }),
    ];
    const label = intakeMethod(attributionEvent(events));
    expect(label).toBe("CSV Import");
    const report = buildChannelReport({
      companyId: 7,
      applications: [application({ events })],
    });
    expect(report.totals).toEqual({ applications: 1, candidates: 1 });
    expect(report.rows.map((row) => row.intake)).toEqual(["CSV Import"]);
    expect(sourceQuality([
      {
        applicationId: 1,
        appliedAt: "2026-03-15T12:00:00.000Z",
        hiredAt: null,
        status: "CV_POOL",
        source: label,
      },
    ])).toEqual([{ source: "CSV Import", people: 1, hired: 0, hireRate: 0 }]);
  });

  it("picks the earliest processed event and breaks timestamp ties by id", () => {
    const sameTime = new Date("2026-03-15T12:00:00.000Z");
    const earlier = attributionEvent([
      event({ id: 1, receivedAt: new Date("2026-03-16T12:00:00.000Z"), externalApplicationId: "inbound:8" }),
      event({ id: 9, receivedAt: new Date("2026-03-15T12:00:00.000Z"), externalApplicationId: "import:3:2" }),
    ]);
    expect(earlier?.externalApplicationId).toBe("import:3:2");

    const tied = attributionEvent([
      event({ id: 9, receivedAt: sameTime, externalApplicationId: "inbound:8" }),
      event({ id: 3, receivedAt: sameTime, externalApplicationId: "import:3:2" }),
    ]);
    expect(tied?.id).toBe(3);

    const unprocessed = attributionEvent([
      event({ id: 8, status: "FAILED", receivedAt: new Date("2026-03-16T00:00:00.000Z"), externalApplicationId: "inbound:8" }),
      event({ id: 4, status: "RECEIVED", receivedAt: sameTime, externalApplicationId: "import:4:1" }),
    ]);
    expect(unprocessed?.id).toBe(4);

    const mixed = attributionEvent([
      event({ id: 2, status: "FAILED", receivedAt: new Date("2026-03-14T00:00:00.000Z"), externalApplicationId: "import:1:1" }),
      event({ id: 6, status: "PROCESSED", receivedAt: new Date("2026-03-16T00:00:00.000Z"), sourceChannel: "HOSTED_APPLY", externalApplicationId: null }),
      event({ id: 7, status: "PROCESSED", receivedAt: sameTime, sourceChannel: "MANUAL", externalApplicationId: null }),
    ]);
    expect(mixed?.id).toBe(7);

    const report = buildChannelReport({
      companyId: 7,
      applications: [
        application({
          applicationId: 1,
          events: [
            event({ id: 9, receivedAt: sameTime, externalApplicationId: "inbound:8" }),
            event({ id: 3, receivedAt: sameTime, externalApplicationId: "import:3:2" }),
          ],
        }),
        application({ applicationId: 2, companyId: 8, events: [event({ id: 1, externalApplicationId: "import:9:1" })] }),
      ],
    });
    expect(report.totals).toEqual({ applications: 1, candidates: 1 });
    expect(report.rows).toMatchObject([{ intake: "CSV Import", applications: 1 }]);
  });
});

function event(overrides: Partial<ChannelEvent> = {}): ChannelEvent {
  return {
    id: 1,
    receivedAt: new Date("2026-03-15T12:00:00.000Z"),
    status: "PROCESSED",
    sourceChannel: "MANUAL",
    externalApplicationId: null,
    distributionId: null,
    ...overrides,
  };
}
