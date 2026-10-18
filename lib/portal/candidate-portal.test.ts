import { describe, expect, it } from "vitest";

import {
  documentRejection,
  icsEvent,
  linkExpired,
  maySendCandidateEmail,
  nextPortalAction,
  parseStatusLabel,
  portalExport,
  PORTAL_LINK_TTL_MS,
} from "@/lib/portal/candidate-portal";
import { readPortalSession, signPortalSession } from "@/lib/portal/portal-session";

describe("candidate portal rules", () => {
  it("expires magic links and sessions", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(linkExpired(new Date(now.getTime() + PORTAL_LINK_TTL_MS), now)).toBe(false);
    expect(linkExpired(new Date(now.getTime() - 1), now)).toBe(true);
    const secret = "test-secret";
    const live = signPortalSession("ada@example.com", new Date(now.getTime() + 1000), secret);
    const dead = signPortalSession("ada@example.com", new Date(now.getTime() - 1000), secret);
    expect(readPortalSession(live, now, secret)?.email).toBe("ada@example.com");
    expect(readPortalSession(dead, now, secret)).toBeNull();
    expect(readPortalSession(`${live}x`, now, secret)).toBeNull();
  });

  it("checks uploads, parse words, next action, and email kinds", () => {
    expect(documentRejection({ contentType: "text/plain", sizeBytes: 10 })).toMatch(/PDF or Word/);
    expect(documentRejection({ contentType: "application/pdf", sizeBytes: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(documentRejection({ contentType: "application/pdf", sizeBytes: 100 })).toBeNull();
    expect(parseStatusLabel("UNREADABLE")).toMatch(/couldn't read this scan/);
    expect(nextPortalAction({ withdrawn: false, hasResume: false, pendingAssessment: false, needsInterview: true })).toBe("Book interview");
    expect(nextPortalAction({ withdrawn: true, hasResume: false, pendingAssessment: true, needsInterview: true })).toBeNull();
    expect(maySendCandidateEmail({ unsubscribed: true, kind: "interview" })).toBe(false);
    expect(maySendCandidateEmail({ unsubscribed: true, kind: "decision" })).toBe(true);
  });

  it("exports applications without scores and builds a calendar file", () => {
    const data = portalExport({
      email: "ada@example.com",
      applications: [{
        id: 1,
        job: "Backend",
        company: "Nimbus",
        stage: "Under review",
        withdrawn: false,
        interviews: [{ at: "2026-10-20T04:30:00.000Z", type: "TECHNICAL", meetUrl: null }],
        assessments: [{ submittedAt: "2026-10-19T00:00:00.000Z", deadline: "2026-10-21T00:00:00.000Z" }],
        documents: [{ fileName: "cv.pdf", kind: "RESUME", parseStatus: "PARSED" }],
        files: [{ fileName: "cv.pdf", kind: "RESUME", contentBase64: "JVBERi0=" }],
      }],
    });
    expect(JSON.stringify(data)).not.toMatch(/score/i);
    expect(data.applications[0]?.documents[0]?.fileName).toBe("cv.pdf");
    expect(icsEvent({
      uid: "1@hireiq",
      title: "Interview",
      start: new Date("2026-10-20T04:30:00Z"),
      end: new Date("2026-10-20T05:30:00Z"),
      meetUrl: "https://meet.example/abc",
    })).toContain("BEGIN:VCALENDAR");
  });
});
