import { describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  result: {
    sent: true,
    provider: "resend",
  } as
    | { sent: true; provider: "resend" }
    | { sent: false; reason: "provider-not-configured" },
}));

vi.mock("@/lib/communication/email-transport", () => ({
  sendOutboundEmail: vi.fn(async () => transport.result),
}));

import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { deliverBookingConfirmation } from "@/lib/interviews/scheduling-emails";

const input = {
  interviewerEmail: "interviewer@hireiq.test",
  interviewerName: "Ada",
  candidateName: "Pat",
  candidateEmail: "",
  jobTitle: "Engineer",
  companyName: "Harbor",
  scheduledAt: new Date("2026-11-01T10:00:00.000Z"),
  durationMinutes: 45,
};

describe("booking email outcome", () => {
  it("still alerts the interviewer when the candidate address is missing", async () => {
    transport.result = { sent: true, provider: "resend" };
    const delivery = await deliverBookingConfirmation(input);
    expect(delivery.outcome).toBe("MISSING_RECIPIENT");
    expect(delivery.sent).toBe(1);
    expect(vi.mocked(sendOutboundEmail).mock.calls.map((call) => call[0].to)).toEqual([
      "interviewer@hireiq.test",
    ]);
  });

  it("does not record sent when transport fails", async () => {
    transport.result = { sent: false, reason: "provider-not-configured" };
    const delivery = await deliverBookingConfirmation({
      ...input,
      candidateEmail: "pat@hireiq.test",
    });
    expect(delivery.outcome).toBe("PROVIDER_NOT_CONFIGURED");
    expect(delivery.sent).toBe(0);
  });
});
