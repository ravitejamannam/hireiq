import { ApplicationPipelineStatus, PortalRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { jobScopeWhere } from "@/lib/auth/authorization";
import {
  applicationIntakeLabel,
  buildHiringFunnelReport,
  formatHireDuration,
  reachedHiringStage,
  timeToHireFromSnapshots,
  type ApplicationFunnelSnapshot,
} from "@/lib/hiring/funnel";
import { resolveApplicationSourceLabel } from "@/lib/hiring/ingestion-source";
import {
  normalizeInterviewRoundPlan,
  interviewRoundProgress,
} from "@/lib/hiring/interview-rounds";
import { buildApplicationTimeline } from "@/lib/hiring/application-timeline";
import { shortlistedAtPatch } from "@/lib/hiring/pipeline-timestamps";
import { InterviewType } from "@prisma/client";

describe("ingestion source labels", () => {
  it("prefers the ingestion channel over the sourcing-database field", () => {
    expect(
      resolveApplicationSourceLabel({
        sourceChannel: "HOSTED_APPLY",
        sourcingDatabaseSource: "LINKEDIN",
      }),
    ).toBe("Hosted apply");
  });

  it("falls back to hosted apply when a submission id is present", () => {
    expect(
      resolveApplicationSourceLabel({
        hostedApplySubmissionId: 12,
      }),
    ).toBe("Hosted apply");
  });
});

describe("hiring desk intake attribution", () => {
  const at = new Date("2026-03-15T12:00:00.000Z");

  function snapshot(events: ApplicationFunnelSnapshot["ingestionEvents"], extra: Partial<ApplicationFunnelSnapshot> = {}): ApplicationFunnelSnapshot {
    return {
      createdAt: at,
      status: ApplicationPipelineStatus.CV_POOL,
      shortlistedAt: null,
      assessmentSubmittedAt: null,
      interviewBookedAt: null,
      offerMintedAt: null,
      offerAcceptedAt: null,
      billedAt: null,
      sourcingDatabaseSource: "LINKEDIN",
      ingestionEvents: events,
      ...extra,
    };
  }

  it("classifies recorded intake and keeps the sourcing field as a fallback only", () => {
    expect(applicationIntakeLabel(snapshot([{ id: 1, receivedAt: at, status: "PROCESSED", sourceChannel: "MANUAL", externalApplicationId: "import:3:2", distributionId: null }]))).toBe("CSV Import");
    expect(applicationIntakeLabel(snapshot([{ id: 1, receivedAt: at, status: "PROCESSED", sourceChannel: "MANUAL", externalApplicationId: "inbound:8", distributionId: null }]))).toBe("Inbound Email");
    expect(applicationIntakeLabel(snapshot([{ id: 1, receivedAt: at, status: "PROCESSED", sourceChannel: "HOSTED_APPLY", externalApplicationId: null, distributionId: null }]))).toBe("Hosted Apply");
    expect(applicationIntakeLabel(snapshot([{ id: 1, receivedAt: at, status: "PROCESSED", sourceChannel: "MANUAL", externalApplicationId: null, distributionId: null }]))).toBe("Manual Entry");
    expect(applicationIntakeLabel(snapshot([], { sourcingDatabaseSource: "NAUKRI" }))).toBe("Naukri");
    expect(applicationIntakeLabel(snapshot([], { sourcingDatabaseSource: null, hostedApplySubmissionId: 12 }))).toBe("Hosted apply");
    expect(applicationIntakeLabel(snapshot([]))).toBe("LinkedIn");
    expect(applicationIntakeLabel(snapshot(undefined, { sourcingDatabaseSource: null, sourceChannel: null }))).toBe("Unknown");
  });

  it("uses the earliest processed event and does not count a retry twice", () => {
    const events = [
      { id: 9, receivedAt: at, status: "PROCESSED", sourceChannel: "MANUAL", externalApplicationId: "inbound:8", distributionId: null },
      { id: 3, receivedAt: at, status: "PROCESSED", sourceChannel: "MANUAL", externalApplicationId: "import:3:2", distributionId: null },
      { id: 1, receivedAt: new Date("2026-03-14T00:00:00.000Z"), status: "FAILED", sourceChannel: "HOSTED_APPLY", externalApplicationId: null, distributionId: null },
    ];
    expect(applicationIntakeLabel(snapshot(events))).toBe("CSV Import");
    const report = buildHiringFunnelReport([
      snapshot(events, { status: ApplicationPipelineStatus.HIRED }),
      snapshot([{ id: 4, receivedAt: at, status: "PROCESSED", sourceChannel: "MANUAL", externalApplicationId: "import:9:1", distributionId: null }], { sourcingDatabaseSource: "NAUKRI" }),
    ]);
    expect(report.totals.applications).toBe(2);
    expect(report.sources).toEqual([{ source: "CSV Import", count: 2, hires: 1 }]);
  });

  it("keeps a company admin inside that company", () => {
    const admin = {
      id: 1,
      email: "admin@hireiq.test",
      name: "Admin",
      role: PortalRole.ADMIN,
      companyId: 7,
      interviewerId: null,
      platformOperator: false,
    };
    expect(jobScopeWhere(admin)).toEqual({ companyId: 7 });
    expect(jobScopeWhere({ ...admin, companyId: null })).toEqual({ id: -1 });
  });
});

describe("hiring funnel", () => {
  const base = {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    status: ApplicationPipelineStatus.CV_POOL,
    shortlistedAt: null,
    assessmentSubmittedAt: null,
    interviewBookedAt: null,
    offerMintedAt: null,
    offerAcceptedAt: null,
    billedAt: null,
    sourceChannel: "HOSTED_APPLY",
  };

  it("counts assessment complete only when submitted", () => {
    expect(reachedHiringStage(base, "assessed")).toBe(false);
    expect(
      reachedHiringStage(
        { ...base, assessmentSubmittedAt: new Date("2026-01-02T00:00:00Z") },
        "assessed",
      ),
    ).toBe(true);
  });

  it("measures hire duration from creation to the HIRED event", () => {
    const report = buildHiringFunnelReport([
      {
        ...base,
        status: ApplicationPipelineStatus.HIRED,
        offerAcceptedAt: new Date("2026-01-11T00:00:00Z"),
        hiredAt: new Date("2026-01-11T00:00:00Z"),
      },
    ]);
    expect(report.timeToHireDays).toBe(10);
    expect(report.timeToHireLabel).toBe("10 days");
    expect(report.sources[0]?.source).toBe("Hosted apply");
    expect(report.funnel.find((s) => s.key === "hired")?.count).toBe(1);
  });

  it("does not treat offer acceptance as the hire timestamp", () => {
    const report = buildHiringFunnelReport([
      {
        ...base,
        status: ApplicationPipelineStatus.HIRED,
        offerAcceptedAt: new Date("2026-01-11T00:00:00Z"),
      },
    ]);
    expect(report.timeToHireLabel).toBe("No data");
    expect(report.timeToHireDays).toBeNull();
  });
});

describe("time to hire labels", () => {
  const created = new Date("2026-01-01T00:00:00Z");

  it("says No data when nothing was hired", () => {
    expect(timeToHireFromSnapshots([{ createdAt: created }])).toEqual({
      days: null,
      label: "No data",
    });
  });

  it("ignores a hire timestamp before the application existed", () => {
    expect(
      timeToHireFromSnapshots([
        { createdAt: created, hiredAt: new Date("2025-12-01T00:00:00Z") },
      ]).label,
    ).toBe("No data");
  });

  it("does not call a same-day hire 0 days", () => {
    expect(formatHireDuration(3 * 60 * 60 * 1000)).toBe("3 hours");
    expect(formatHireDuration(20 * 60 * 1000)).toBe("Less than 1 hour");
    expect(
      timeToHireFromSnapshots([
        { createdAt: created, hiredAt: new Date("2026-01-01T05:00:00Z") },
      ]).label,
    ).toBe("5 hours");
  });

  it("averages several valid hire intervals", () => {
    const result = timeToHireFromSnapshots([
      { createdAt: created, hiredAt: new Date("2026-01-11T00:00:00Z") },
      { createdAt: created, hiredAt: new Date("2026-01-21T00:00:00Z") },
      { createdAt: created, hiredAt: new Date("2025-01-01T00:00:00Z") },
    ]);
    expect(result.days).toBe(15);
    expect(result.label).toBe("15 days");
  });
});

describe("interview rounds", () => {
  it("defaults empty plans to phone screen then technical", () => {
    expect(normalizeInterviewRoundPlan([])).toEqual([
      InterviewType.PHONE_SCREEN,
      InterviewType.TECHNICAL,
    ]);
  });

  it("counts booked vs completed without inventing a score", () => {
    const progress = interviewRoundProgress(
      [InterviewType.PHONE_SCREEN, InterviewType.TECHNICAL],
      [
        { type: InterviewType.PHONE_SCREEN, result: "PASSED" },
        { type: InterviewType.TECHNICAL, result: "PENDING" },
      ],
    );
    expect(progress[0]).toMatchObject({ booked: 1, completed: 1 });
    expect(progress[1]).toMatchObject({ booked: 1, completed: 0 });
  });
});

describe("application timeline", () => {
  it("keeps assessment score labeled as not a hire decision", () => {
    const events = buildApplicationTimeline({
      id: 1,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      status: "CV_POOL",
      shortlistedAt: null,
      offerMintedAt: null,
      offerAcceptedAt: null,
      offerDeclinedAt: null,
      candidateName: "Ada",
      jobTitle: "Engineer",
      sourceLabel: "Hosted apply",
      assessmentStartedAt: new Date("2026-01-02T00:00:00Z"),
      assessmentSubmittedAt: new Date("2026-01-02T01:00:00Z"),
      assessmentScore: 8,
      assessmentMaxScore: 10,
      evaluations: [],
      interviews: [],
      bookingUsedAt: null,
      ranking: { rank: 2, createdAt: new Date("2026-01-03T00:00:00Z") },
    });
    const assessment = events.find((e) => e.kind === "assessment_completed");
    const ranked = events.find((e) => e.kind === "ranked");
    expect(assessment?.detail).toContain("not a hire decision");
    expect(ranked?.detail).toContain("not a hire decision");
  });
});

describe("shortlisted timestamp", () => {
  it("stamps only the first transition to SHORTLISTED", () => {
    expect(
      shortlistedAtPatch(ApplicationPipelineStatus.SHORTLISTED, null).shortlistedAt,
    ).toBeInstanceOf(Date);
    expect(
      shortlistedAtPatch(
        ApplicationPipelineStatus.SHORTLISTED,
        new Date("2026-01-01"),
      ),
    ).toEqual({});
  });
});
