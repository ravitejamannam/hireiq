import { describe, expect, it } from "vitest";

import { googleMeetEventBody } from "@/lib/interviews/calendar-sync-service";
import { reminderIsSendable, reminderRows } from "@/lib/interviews/interview-reminders";
import { calendarNeedsReconnect } from "@/lib/interviews/calendar-sync-service";
import {
  calculateOpenSlots,
  reminderInstants,
  visibleScorecards,
} from "@/lib/interviews/slot-calculation";

const kolkata = 5 * 60 + 30;

describe("interview slots", () => {
  it("keeps slots inside Kolkata working hours, after 24 hours, and clear of busy time", () => {
    const now = new Date("2026-10-20T04:00:00.000Z");
    const slots = calculateOpenSlots({
      now,
      timeZoneOffsetMinutes: kolkata,
      workingStartHour: 10,
      workingEndHour: 12,
      durationMinutes: 30,
      bufferMinutes: 15,
      leadHours: 24,
      horizonDays: 2,
      busy: [
        {
          start: new Date("2026-10-21T04:30:00.000Z"),
          end: new Date("2026-10-21T05:15:00.000Z"),
        },
      ],
    });
    expect(slots[0]?.toISOString()).toBe("2026-10-21T05:15:00.000Z");
    expect(slots.some((slot) => slot.toISOString() === "2026-10-21T04:30:00.000Z")).toBe(false);
    expect(slots.every((slot) => slot.getTime() >= now.getTime() + 24 * 60 * 60 * 1000)).toBe(true);
    const gap = slots[1]!.getTime() - slots[0]!.getTime();
    expect(gap).toBe(45 * 60 * 1000);
  });

  it("builds a Meet event and queues both reminders", () => {
    const start = new Date("2026-10-22T10:00:00.000Z");
    const body = googleMeetEventBody({
      summary: "Interview",
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
      attendees: ["a@example.com"],
      requestId: "hireiq-1",
    });
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
    expect(reminderRows(4, start).map((row) => row.kind)).toEqual(["H24", "H1"]);
    const now = new Date("2026-10-22T10:30:00.000Z");
    expect(reminderIsSendable({ sendAt: new Date("2026-10-22T09:00:00.000Z"), interviewAt: start, now })).toBe(false);
    expect(reminderIsSendable({ sendAt: new Date("2026-10-21T10:00:00.000Z"), interviewAt: start, now: new Date("2026-10-21T11:00:00.000Z") })).toBe(true);
    expect(calendarNeedsReconnect(null)).toBe(true);
    expect(calendarNeedsReconnect("https://www.googleapis.com/auth/calendar.readonly")).toBe(true);
    expect(calendarNeedsReconnect("https://www.googleapis.com/auth/calendar.events")).toBe(false);
  });

  it("queues a 24h and a 1h reminder", () => {
    const start = new Date("2026-10-22T10:00:00.000Z");
    const [day, hour] = reminderInstants(start);
    expect(day.toISOString()).toBe("2026-10-21T10:00:00.000Z");
    expect(hour.toISOString()).toBe("2026-10-22T09:00:00.000Z");
  });

  it("hides other scorecards until this interviewer submits", () => {
    const cards = [
      { interviewerId: 1, submittedAt: null, score: 4 },
      { interviewerId: 2, submittedAt: new Date(), score: 5 },
    ];
    expect(visibleScorecards({ viewerInterviewerId: null, cards }).map((card) => card.interviewerId)).toEqual([2]);
    expect(visibleScorecards({ viewerInterviewerId: 1, cards }).map((card) => card.interviewerId)).toEqual([1]);
    const after = cards.map((card) =>
      card.interviewerId === 1 ? { ...card, submittedAt: new Date() } : card,
    );
    expect(visibleScorecards({ viewerInterviewerId: 1, cards: after })).toHaveLength(2);
  });
});
