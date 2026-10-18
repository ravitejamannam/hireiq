import { describe, expect, it } from "vitest";

import { dockerRunArgs, judge0Submission, runCodeSubmission } from "@/lib/assessments/code-sandbox";
import { assertSsoIdentity, ssoConnectionForEmail } from "@/lib/auth/sso";
import { dropOff, sourceQuality, timeToHireDays } from "@/lib/analytics/recruiter-analytics";
import { signWebhookBody, stageWebhookBody, webhookSignatureMatches } from "@/lib/api/partner-webhook";
import { buildMicrosoftAuthUrl } from "@/lib/interviews/microsoft-calendar";
import { sendWhatsApp, whatsAppMessage } from "@/lib/communication/whatsapp";

describe("platform suite", () => {
  it("refuses to run candidate code on the app host", async () => {
    const previousJudge = process.env.JUDGE0_URL;
    const previousDocker = process.env.HIREIQ_CODE_RUNNER;
    delete process.env.JUDGE0_URL;
    delete process.env.HIREIQ_CODE_RUNNER;
    const result = await runCodeSubmission({
      language: "javascript",
      source: "function solve(input) { return input; }",
      tests: [{ input: "2", output: "4" }, { input: "5", output: "9", hidden: true }],
    });
    expect(result.runner).toBe("unavailable");
    expect(result.passed).toBe(0);
    expect(result.error).toMatch(/isolated runner/);
    if (previousJudge === undefined) delete process.env.JUDGE0_URL;
    else process.env.JUDGE0_URL = previousJudge;
    if (previousDocker === undefined) delete process.env.HIREIQ_CODE_RUNNER;
    else process.env.HIREIQ_CODE_RUNNER = previousDocker;
  });

  it("asks Judge0 for no network and a memory cap", () => {
    const body = judge0Submission({
      language: "javascript",
      source: "function solve(input) { return input; }",
      tests: [{ input: "1", output: "1" }],
    });
    expect(body.enable_network).toBe(false);
    expect(body.memory_limit).toBe(64_000);
    expect(body.cpu_time_limit).toBe(2);
    expect(body.source_code).not.toMatch(/child_process|fs\.|process\.env/);
  });

  it("starts Docker with no network, no mounts, and no host environment", () => {
    const args = dockerRunArgs({
      language: "python",
      source: "def solve(value):\n    return value\n",
      tests: [{ input: "1", output: "1", hidden: true }],
    });
    expect(args).toContain("--network");
    expect(args[args.indexOf("--network") + 1]).toBe("none");
    expect(args).toContain("--read-only");
    expect(args).toContain("--cap-drop");
    expect(args).not.toContain("-v");
    expect(args).not.toContain("--env");
    expect(args[0]).toBe("run");
  });

  it("refuses an SSO identity from another company's domain", () => {
    const connections = [{
      companyId: 1,
      provider: "OKTA" as const,
      domain: "nimbus.example",
      issuer: "https://nimbus.okta.com",
      clientId: "abc",
      enabled: true,
    }];
    const connection = ssoConnectionForEmail("priya@kaveri.example", connections);
    expect(connection).toBeNull();
    const nimbus = ssoConnectionForEmail("priya@nimbus.example", connections)!;
    expect(assertSsoIdentity({ email: "priya@kaveri.example", issuer: nimbus.issuer, connection: nimbus })).toMatch(/not allowed/);
    expect(assertSsoIdentity({ email: "priya@nimbus.example", issuer: "https://other.okta.com", connection: nimbus })).toMatch(/does not match/);
    expect(assertSsoIdentity({ email: "priya@nimbus.example", issuer: nimbus.issuer, connection: nimbus })).toBeNull();
  });

  it("signs partner webhooks so the receiver can verify them", () => {
    const body = JSON.stringify(stageWebhookBody({
      companyId: 1,
      applicationId: 2,
      jobId: 3,
      fromStatus: "CV_POOL",
      toStatus: "EXPERT_REVIEW",
    }));
    const timestamp = new Date().toISOString();
    const signature = signWebhookBody("secret", timestamp, body);
    expect(webhookSignatureMatches("secret", timestamp, body, `sha256=${signature}`)).toBe(true);
    expect(webhookSignatureMatches("secret", "2020-01-01T00:00:00.000Z", body, `sha256=${signature}`)).toBe(false);
  });

  it("does not send WhatsApp unless the candidate opted in", async () => {
    const message = whatsAppMessage({ kind: "stage", title: "Backend", detail: "Moved to interview" });
    expect(message).toMatch(/Reply STOP/);
    const blocked = await sendWhatsApp({ to: "+919845012345", optedIn: false, templateName: "interview_reminder", parameters: [] });
    expect(blocked.sent).toBe(false);
    expect(blocked.reason).toBe("not-opted-in");
    const unapproved = await sendWhatsApp({ to: "+919845012345", optedIn: true, templateName: null, parameters: [message] });
    expect(unapproved.reason).toBe("template-required");
  });

  it("builds a Microsoft 365 consent URL when the app is configured", () => {
    process.env.MICROSOFT_CLIENT_ID = "client";
    process.env.MICROSOFT_CLIENT_SECRET = "secret";
    const url = new URL(buildMicrosoftAuthUrl({ userId: 4, requestOrigin: "http://localhost:4000" }));
    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.searchParams.get("scope")).toMatch(/Calendars.ReadWrite/);
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
  });

  it("ranks sources by hire rate and reports time to hire", () => {
    const events = [
      { applicationId: 1, appliedAt: "2026-01-01T00:00:00.000Z", hiredAt: "2026-01-11T00:00:00.000Z", status: "HIRED", source: "NAUKRI" },
      { applicationId: 2, appliedAt: "2026-01-01T00:00:00.000Z", hiredAt: null, status: "REJECTED", source: "LINKEDIN" },
      { applicationId: 3, appliedAt: "2026-01-01T00:00:00.000Z", hiredAt: "2026-01-21T00:00:00.000Z", status: "HIRED", source: "NAUKRI" },
    ];
    expect(timeToHireDays(events)).toBe(15);
    expect(dropOff(events).find((row) => row.status === "HIRED")?.count).toBe(2);
    expect(sourceQuality(events)[0]?.source).toBe("NAUKRI");
  });
});
