import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assessmentAssistant } from "@/lib/assessments/ai-use-policy";
import { cronbachAlpha, difCheck, itemFlags, pValue, pointBiserial, statisticsAudit } from "@/lib/assessments/item-statistics";
import { applyReportFilter, parseReportFilter } from "@/lib/analytics/nl-filters";
import { capturePublicProfile } from "@/lib/extension/capture";
import { hireHandoff } from "@/lib/hris/handoff";
import { applyScim, deprovisionEffect, emptyDirectory, roleFromGroups, sessionRevoked } from "@/lib/identity/scim";
import { leadAssignmentAllowed, recordObservation } from "@/lib/interviewers/qualification";
import { cleanupManualNotes, evidenceFromNotetaker, recordingAllowed } from "@/lib/interviews/notetaker";
import { translate } from "@/lib/i18n/catalog";
import { callMcpTool, mcpTools } from "@/lib/mcp/readonly-server";
import { createOfferSignature } from "@/lib/offers/esign";
import { draftOutreachEmail, pauseOnReply, sendNextStep, unsubscribe } from "@/lib/outreach/sequences";
import { webhookSignatureMatches } from "@/lib/api/partner-webhook";

const now = new Date("2026-10-18T12:00:00.000Z");
const subject = {
  companyId: 1,
  entityType: "Application",
  entityId: 2,
  model: "gpt-4o-mini",
  promptVersion: "v1",
  input: { test: true },
  db: { aIRun: { create: async ({ data }: { data: unknown }) => data } },
};

describe("SSO and SCIM", () => {
  it("matches the Okta and Azure AD SCIM validator cases and isolates companies", () => {
    let state = emptyDirectory(1);
    const config = applyScim({ state, companyId: 1, method: "GET", path: "/ServiceProviderConfig", query: {}, now });
    expect(config.status).toBe(200);
    const created = applyScim({
      state,
      companyId: 1,
      method: "POST",
      path: "/Users",
      query: {},
      now,
      body: { userName: "priya@nimbus.example", name: { givenName: "Priya", familyName: "R" }, active: true },
    });
    expect(created.status).toBe(201);
    state = created.state;
    const filtered = applyScim({
      state,
      companyId: 1,
      method: "GET",
      path: "/Users",
      query: { filter: 'userName eq "priya@nimbus.example"' },
      now,
    });
    expect((filtered.body as { totalResults: number }).totalResults).toBe(1);
    const other = applyScim({ state, companyId: 2, method: "GET", path: "/Users/1", query: {}, now });
    expect(other.status).toBe(404);
    const azurePatch = applyScim({
      state,
      companyId: 1,
      method: "PATCH",
      path: "/Users/1",
      query: {},
      now,
      body: { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "Replace", path: "active", value: false }] },
    });
    expect(azurePatch.deprovision?.completedWithinMs).toBeLessThan(60_000);
    expect(azurePatch.deprovision?.revokeApiKeys).toBe(true);
    expect(sessionRevoked({ disabledAt: azurePatch.deprovision!.disabledAt, passwordChangedAt: azurePatch.deprovision!.passwordChangedAt, tokenPwdAt: now.getTime() - 1000 })).toBe(true);
    const group = applyScim({ state: azurePatch.state, companyId: 1, method: "POST", path: "/Groups", query: {}, now, body: { displayName: "Recruiters" } });
    const member = applyScim({
      state: group.state,
      companyId: 1,
      method: "PATCH",
      path: `/Groups/${(group.body as { id: string }).id}`,
      query: {},
      now,
      body: { Operations: [{ op: "add", path: "members", value: { value: "1" } }] },
    });
    expect((member.body as { members: unknown[] }).members).toHaveLength(1);
    expect(roleFromGroups(["Recruiters"], [{ groupName: "Recruiters", portalRole: "CLIENT" }]).platformOperator).toBe(false);
  });

});

describe("item statistics", () => {
  it("computes difficulty, discrimination, reliability, flags, and holds DIF", () => {
    const item = [1, 1, 0, 0, 1];
    const rest = [4, 5, 1, 0, 3];
    expect(pValue(item)).toBeCloseTo(0.6);
    expect(pointBiserial(item, rest)).toBeGreaterThan(0);
    const alpha = cronbachAlpha([
      [1, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(alpha).toBeGreaterThan(0);
    expect(itemFlags({ p: 0.99, discrimination: 0.05 })).toContain("too-easy");
    expect(difCheck({ groupA: [1, 0], groupB: [1, 1, 0] }).status).toBe("insufficient");
    expect(difCheck({ groupA: Array(30).fill(1), groupB: Array(30).fill(0) }).status).toBe("flag");
    expect(statisticsAudit(4, 9, 1).companyId).toBe(4);
    const source = readFileSync(join(process.cwd(), "lib/assessments/item-statistics.ts"), "utf8");
    expect(source).not.toMatch(/CandidateSelfIdentification|from \"@\/lib\/fairness\/self-id\"/);
  });
});

describe("notetaker, AI policy, HRIS, outreach", () => {
  it("requires every participant's consent and drops ratings", async () => {
    expect(recordingAllowed({ companyId: 1, participants: ["a@nimbus.example", "b@nimbus.example"], consents: [{ email: "a@nimbus.example", companyId: 1 }] }).allowed).toBe(false);
    const notes = evidenceFromNotetaker({
      companyId: 1,
      interviewCompanyId: 1,
      provider: "METAVIEW",
      consentsComplete: true,
      segments: [{ quote: "We scaled Kubernetes.", timestampSec: 42, rating: 5 }],
    });
    expect(notes.notes[0]).toEqual({ quote: "We scaled Kubernetes.", timestampSec: 42, source: "METAVIEW" });
    expect(evidenceFromNotetaker({ companyId: 2, interviewCompanyId: 1, provider: "BRIGHTHIRE", consentsComplete: true, segments: [] }).error).toMatch(/not found/);
    const runs: unknown[] = [];
    await cleanupManualNotes({
      companyId: 1,
      interviewId: 3,
      notes: "Talked about Postgres.",
      actor: { userId: 1 },
      subject: { ...subject, db: { aIRun: { create: async ({ data }) => { runs.push(data); return data; } } } },
      complete: async () => "Quote: Talked about Postgres.",
    });
    expect(runs).toHaveLength(1);
  });

  it("logs the assistant only when the assessment allows AI", async () => {
    const blocked = await assessmentAssistant({
      policy: "NOT_ALLOWED",
      companyId: 1,
      inviteCompanyId: 1,
      inviteId: 4,
      prompt: "hint",
      actor: null,
      subject: null,
      complete: async () => "nope",
    });
    expect(blocked.error).toMatch(/not allowed/);
    const runs: unknown[] = [];
    const allowed = await assessmentAssistant({
      policy: "AI_ALLOWED",
      companyId: 1,
      inviteCompanyId: 1,
      inviteId: 4,
      prompt: "What does this test ask?",
      actor: { userId: null },
      subject: { ...subject, db: { aIRun: { create: async ({ data }) => { runs.push(data); return data; } } } },
      complete: async () => "It asks for a short plan.",
    });
    expect(allowed.logged).toHaveLength(2);
    expect(runs).toHaveLength(1);
    expect(await assessmentAssistant({
      policy: "AI_ALLOWED", companyId: 2, inviteCompanyId: 1, inviteId: 4, prompt: "x", actor: null, subject: null, complete: async () => "",
    })).toMatchObject({ error: "Assessment not found." });
  });

  it("signs an HRIS hire webhook and falls back to CSV", () => {
    const row = { companyId: 1, applicationId: 8, name: "Priya", email: "priya@nimbus.example", title: "Backend", hiredAt: now.toISOString() };
    const signed = hireHandoff({ provider: "KEKA", row, secret: "secret", status: "HIRED" });
    expect(signed.ok && signed.delivery === "webhook" && webhookSignatureMatches("secret", signed.timestamp!, signed.body, signed.signature, now.getTime())).toBe(true);
    expect(hireHandoff({ provider: "BAMBOOHR", row, secret: null, status: "HIRED" }).ok && hireHandoff({ provider: "BAMBOOHR", row, secret: null, status: "HIRED" }).delivery).toBe("csv");
    expect(hireHandoff({ provider: "ZOHO_PEOPLE", row, secret: "secret", status: "CV_POOL" }).ok).toBe(false);
  });

  it("holds outreach until approval and pauses on reply or unsubscribe", async () => {
    const runs: unknown[] = [];
    const draft = await draftOutreachEmail({
      companyId: 1,
      applicationId: 8,
      candidateName: "Priya",
      role: "Backend",
      actor: { userId: 1 },
      subject: { ...subject, db: { aIRun: { create: async ({ data }) => { runs.push(data); return data; } } } },
      complete: async () => ({ subject: "Hello", body: "Priya, the backend role is open." }),
    });
    expect(draft.sent).toBe(false);
    expect(runs).toHaveLength(1);
    const enrollment = { companyId: 1, applicationId: 8, status: "ACTIVE" as const, currentStep: 0 };
    expect(sendNextStep({ actorCompanyId: 1, enrollment, steps: [{ position: 0, subject: "Hello", body: "Hi", approvedAt: null }] }).sent).toBe(false);
    expect(sendNextStep({ actorCompanyId: 2, enrollment, steps: [{ position: 0, subject: "Hello", body: "Hi", approvedAt: now.toISOString() }] }).error).toMatch(/not found/);
    expect(pauseOnReply(unsubscribe(enrollment)).status).toBe("UNSUBSCRIBED");
  });
});

describe("extension, e-sign, filters, i18n, MCP, training", () => {
  it("captures one public profile and refuses a bulk list", () => {
    expect(capturePublicProfile({ companyId: 1, actorCompanyId: 1, userId: 3, profileUrl: "https://example.com/in/priya", name: "Priya" }).ok).toBe(true);
    expect(capturePublicProfile({ companyId: 1, actorCompanyId: 1, userId: 3, profileUrl: "https://example.com/in/priya", name: "Priya", extraProfiles: [{}] }).ok).toBe(false);
    expect(capturePublicProfile({ companyId: 2, actorCompanyId: 1, userId: 3, profileUrl: "https://example.com/in/priya", name: "Priya" }).ok).toBe(false);
  });

  it("keeps offer signature in draft until the provider is connected", () => {
    expect(createOfferSignature({ companyId: 1, applicationCompanyId: 1, applicationId: 8, provider: "DOCUSIGN", aadhaar: true, configured: true }).ok).toBe(false);
    expect(createOfferSignature({ companyId: 1, applicationCompanyId: 1, applicationId: 8, provider: "LEEGALITY", aadhaar: true, configured: false }).status).toBe("DRAFT");
    expect(createOfferSignature({ companyId: 2, applicationCompanyId: 1, applicationId: 8, provider: "LEEGALITY", aadhaar: false, configured: true }).ok).toBe(false);
  });

  it("turns a report question into a filter and refuses protected attributes", () => {
    expect(parseReportFilter("time to hire from naukri").filter).toMatchObject({ metric: "time_to_hire", source: "NAUKRI" });
    expect(parseReportFilter("rank the women").refusal).toMatch(/can't rank/);
    expect(applyReportFilter([{ source: "NAUKRI", status: "HIRED" }, { source: "LINKEDIN", status: "HIRED" }], { metric: "time_to_hire", source: "NAUKRI", stage: null })).toHaveLength(1);
  });

  it("ships Hindi and keeps the other Indian languages ready", () => {
    expect(translate("hi", "analyticsTitle").text).toMatch(/विश्लेषण/);
    expect(translate("ta", "analyticsTitle").translated).toBe(false);
    expect(translate("te", "trainingTitle").text).toBe(translate("en", "trainingTitle").text);
  });

  it("exposes read-only company-scoped MCP tools", () => {
    expect(mcpTools().map((tool) => tool.name)).toEqual(["search_candidates", "pipeline_stats", "job_details"]);
    expect(mcpTools().every((tool) => tool.readOnly)).toBe(true);
    const job = { id: 3, title: "Backend", counts: { CV_POOL: 2 } };
    expect(callMcpTool({ tool: "job_details", question: "show the job", actorCompanyId: 2, jobCompanyId: 1, job, candidates: [] }).error).toBe("Job not found.");
    expect(callMcpTool({ tool: "reject_candidate", question: "reject", actorCompanyId: 1, jobCompanyId: 1, job, candidates: [] }).ok).toBe(false);
    expect(callMcpTool({ tool: "search_candidates", question: "rank the women", actorCompanyId: 1, jobCompanyId: 1, job, candidates: [] }).error).toMatch(/can't rank/);
  });

  it("requires shadowing before a lead assignment when the company asks for it", () => {
    let record = { companyId: 1, interviewerId: 5, shadowSessions: 0, reverseShadowSessions: 0, qualifiedAt: null as string | null };
    record = recordObservation({ record, actorCompanyId: 1, kind: "SHADOW", now }).record!;
    record = recordObservation({ record, actorCompanyId: 1, kind: "SHADOW", now }).record!;
    record = recordObservation({ record, actorCompanyId: 1, kind: "REVERSE", now }).record!;
    const qualified = recordObservation({ record, actorCompanyId: 1, kind: "REVERSE", now });
    expect(qualified.record?.qualifiedAt).toBeTruthy();
    expect(leadAssignmentAllowed({ requireQualifiedLead: true, record, jobCompanyId: 1, interviewerCompanyId: 1 }).ok).toBe(false);
    expect(leadAssignmentAllowed({ requireQualifiedLead: true, record: qualified.record!, jobCompanyId: 1, interviewerCompanyId: 1 }).ok).toBe(true);
    expect(leadAssignmentAllowed({ requireQualifiedLead: true, record: qualified.record!, jobCompanyId: 2, interviewerCompanyId: 1 }).ok).toBe(false);
    expect(recordObservation({ record, actorCompanyId: 2, kind: "SHADOW", now }).ok).toBe(false);
    expect(deprovisionEffect(now).completedWithinMs).toBe(0);
  });
});
