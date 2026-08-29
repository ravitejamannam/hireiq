import { ApplicationPipelineStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildHiringFunnelReport, reachedHiringStage } from "@/lib/hiring/funnel";
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

  it("does not treat updated pipeline rank as time-to-hire", () => {
    const report = buildHiringFunnelReport([
      {
        ...base,
        status: ApplicationPipelineStatus.HIRED,
        offerAcceptedAt: new Date("2026-01-11T00:00:00Z"),
      },
    ]);
    expect(report.timeToHireDays).toBe(10);
    expect(report.sources[0]?.source).toBe("Hosted apply");
    expect(report.funnel.find((s) => s.key === "hired")?.count).toBe(1);
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
