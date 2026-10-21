import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { retryPendingOutboundEmails, sendOutboundEmail } from "@/lib/communication/email-transport";
import { deliverBookingConfirmation } from "@/lib/interviews/scheduling-emails";
import { prisma } from "@/lib/prisma";
import { eraseCandidate, type ErasureDeps } from "@/lib/privacy/candidate-erasure";
import { createMagicLink } from "@/lib/portal/portal-service";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `mail-${process.pid}-${Date.now()}`;
const SECRET = `${MARKER}-body`;
const ok: ErasureDeps = { deleteObject: async () => ({ status: "ABSENT" }) };
const saved = { resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };

let providerDown = false;
let delivered: Array<{ to: string; subject: string }> = [];
let hold: null | { entered: () => void; wait: Promise<void> } = null;

function pause() {
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => (entered = resolve));
  const waitPromise = new Promise<void>((resolve) => (release = resolve));
  return { entered: enteredPromise, release, hook: { entered, wait: waitPromise } };
}

async function running(promise: Promise<unknown>, ms = 400) {
  const marker = Symbol("running");
  return (await Promise.race([promise.then(() => "done", () => "done"), new Promise((resolve) => setTimeout(() => resolve(marker), ms))])) === marker;
}

describe.skipIf(integrationDatabase.mode === "skip")("email erasure", () => {
  let a = { companyId: 0, adminId: 0, jobId: 0, specId: 0 };
  let b = { companyId: 0, adminId: 0, jobId: 0, specId: 0 };
  const companyIds: number[] = [];
  const userIds: number[] = [];

  async function tenant(label: string) {
    const company = await prisma.company.create({ data: { name: `${MARKER} ${label}`, industry: "T", employees: 2, publicSlug: `${MARKER}-${label}` } });
    companyIds.push(company.id);
    const admin = await prisma.user.create({ data: { email: `${MARKER}-${label}@hireiq.test`, name: label, role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: company.id } });
    userIds.push(admin.id);
    const job = await prisma.job.create({ data: { title: `${MARKER} ${label}`, status: JobStatus.OPEN, companyId: company.id } });
    const spec = await prisma.jobSpecificationVersion.create({ data: { jobId: job.id, versionNumber: 1, status: "PUBLISHED", title: job.title } });
    return { companyId: company.id, adminId: admin.id, jobId: job.id, specId: spec.id };
  }

  async function person(t: typeof a, label: string, email = `${label}-${MARKER}@candidate.test`) {
    const candidate = await prisma.candidate.create({ data: { name: label, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId: t.companyId } });
    const application = await prisma.application.create({ data: { candidateId: candidate.id, jobId: t.jobId, companyId: t.companyId, aiPreference: "ALLOWED" } });
    await prisma.applicationIngestionEvent.create({
      data: { companyId: t.companyId, jobId: t.jobId, applicationId: application.id, candidateId: candidate.id, sourceChannel: "MANUAL", jobSpecificationVersionId: t.specId, status: "PROCESSED", applicantName: label, applicantEmailNormalized: email },
    });
    return { candidateId: candidate.id, applicationId: application.id, email };
  }

  async function queued(to: string, data: { companyId?: number; candidateId?: number; status?: "PENDING" | "FAILED" | "SENT" } = {}) {
    return prisma.outboundEmailAttempt.create({
      data: { to, subject: `Subject ${MARKER}`, text: SECRET, html: `<p>${SECRET}</p>`, status: data.status ?? "FAILED", attempts: 1, nextRetryAt: new Date(Date.now() - 1000), companyId: data.companyId ?? null, candidateId: data.candidateId ?? null },
    });
  }

  const sweep = () => retryPendingOutboundEmails(500, { OR: [{ subject: { contains: MARKER } }, { companyId: { in: companyIds } }] });
  const sentTo = (to: string) => delivered.filter((row) => row.to === to).length;

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "HireIQ <test@hireiq.test>";
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      if (!String(url).startsWith("https://api.resend.com/")) throw new Error(`Unexpected network call to ${String(url)}`);
      const body = JSON.parse(String(init?.body ?? "{}")) as { to: string[]; subject: string };
      if (providerDown) return new Response("down", { status: 503 });
      if (hold && body.to[0]!.includes(MARKER)) {
        const current = hold;
        hold = null;
        current.entered();
        await current.wait;
      }
      delivered.push({ to: body.to[0]!, subject: body.subject });
      return new Response("{}", { status: 200 });
    });
    a = await tenant("a");
    b = await tenant("b");
  });

  beforeEach(() => {
    providerDown = false;
    delivered = [];
    hold = null;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    process.env.RESEND_API_KEY = saved.resend;
    process.env.EMAIL_FROM = saved.from;
    const where = { companyId: { in: companyIds } };
    await deleteAuditLogsForTests(where);
    await prisma.candidateErasure.deleteMany({ where });
    await prisma.portalLoginLink.deleteMany({ where: { emailNormalized: { contains: MARKER } } });
    await prisma.outboundEmailAttempt.deleteMany({ where: { OR: [where, { to: { contains: MARKER } }, { subject: { contains: MARKER } }] } });
    await prisma.applicationIngestionEvent.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("booking confirmations for the candidate and the interviewer are both tagged to the candidate", async () => {
    const p = await person(a, "booked");
    providerDown = true;
    await deliverBookingConfirmation({
      scope: { companyId: a.companyId, candidateId: p.candidateId },
      candidateUnsubscribed: false, interviewerEmail: `interviewer-${MARKER}@hireiq.test`, interviewerName: "Iris", candidateName: "Booked Person",
      candidateEmail: p.email, jobTitle: "Role", companyName: "Co", scheduledAt: new Date(Date.now() + 86_400_000), durationMinutes: 30,
    });
    const rows = await prisma.outboundEmailAttempt.findMany({ where: { OR: [{ to: p.email }, { to: `interviewer-${MARKER}@hireiq.test` }] } });
    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.companyId === a.companyId && row.candidateId === p.candidateId)).toBe(true);
    await eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    const after = await prisma.outboundEmailAttempt.findMany({ where: { companyId: a.companyId, candidateId: p.candidateId } });
    expect(after.every((row) => row.text === "" && row.status === "CANCELLED" && row.to === "erased@erased.invalid")).toBe(true);
    expect(JSON.stringify(after)).not.toContain("Booked Person");
  });

  it("portal sign-in mail is never queued for retry, so no link is stored at rest", async () => {
    const p = await person(a, "portal");
    providerDown = true;
    const link = await createMagicLink(p.email, "http://localhost:4000");
    expect(link).not.toBeNull();
    expect(await prisma.outboundEmailAttempt.count({ where: { to: p.email } })).toBe(0);
  });

  it("a scoped send for an erased candidate is refused and nothing is queued or sent", async () => {
    const p = await person(a, "gone-send");
    await eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    const result = await sendOutboundEmail({ to: p.email, subject: "s", text: "t", html: "h", scope: { companyId: a.companyId, candidateId: p.candidateId } });
    expect(result).toMatchObject({ sent: false, erased: true });
    expect(sentTo(p.email)).toBe(0);
    expect(await prisma.outboundEmailAttempt.count({ where: { to: p.email } })).toBe(0);
  });

  it("retries a failed message once, and a second sweep does not send it again", async () => {
    const p = await person(a, "retry");
    const row = await queued(p.email, { companyId: a.companyId, candidateId: p.candidateId });
    await sweep();
    expect(sentTo(p.email)).toBe(1);
    expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SENT");
    await sweep();
    expect(sentTo(p.email)).toBe(1);
  });

  it("two workers sweeping at once send each message exactly once", async () => {
    const people = await Promise.all([person(a, "c1"), person(a, "c2"), person(a, "c3")]);
    for (const p of people) await queued(p.email, { companyId: a.companyId, candidateId: p.candidateId });
    const legacy = `legacy-${MARKER}@nobody.test`;
    await queued(legacy);
    await Promise.all([sweep(), sweep(), sweep()]);
    for (const p of people) expect(sentTo(p.email)).toBe(1);
    expect(sentTo(legacy)).toBe(1);
  });

  it("erasure waiting on an in-flight send lets that send finish, then removes the content and sends nothing more", async () => {
    const p = await person(a, "during");
    const row = await queued(p.email, { companyId: a.companyId, candidateId: p.candidateId });
    const gate = pause();
    hold = gate.hook;
    const inflight = sweep();
    await gate.entered;
    const erasure = eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    expect(await running(erasure)).toBe(true);
    expect(sentTo(p.email)).toBe(0);
    gate.release();
    await inflight;
    expect((await erasure).status).toBe("COMPLETED");
    expect(sentTo(p.email)).toBe(1);
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "SENT", text: "", html: "", subject: "erased", to: "erased@erased.invalid" });
    await sweep();
    expect(sentTo(p.email)).toBe(1);
  });

  it("a row selected before erasure is not sent once erasure has run", async () => {
    const p = await person(a, "before");
    const row = await queued(p.email, { companyId: a.companyId, candidateId: p.candidateId });
    // Mimics a worker that selected the row, then lost the race: erase, then restore the row as due.
    await eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    await prisma.outboundEmailAttempt.update({ where: { id: row.id }, data: { status: "FAILED", nextRetryAt: new Date(Date.now() - 1000) } });
    await sweep();
    expect(delivered.some((entry) => entry.subject === "erased" || entry.to === "erased@erased.invalid")).toBe(false);
    expect((await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("CANCELLED");
  });

  it("legacy untagged mail: an address used only by the erased candidate is sanitised", async () => {
    const p = await person(a, "solo");
    const unsent = await queued(p.email);
    const sentRow = await queued(p.email, { status: "SENT" });
    await prisma.portalLoginLink.create({ data: { emailNormalized: p.email, tokenHash: `${MARKER}-solo`, expiresAt: new Date(Date.now() + 60_000) } });
    const result = await eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    expect(result.legacyEmail).toEqual({ sanitized: 2, cancelledOnly: 0, leftAmbiguous: 0 });
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: unsent.id } })).toMatchObject({ status: "CANCELLED", text: "" });
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: sentRow.id } })).toMatchObject({ status: "SENT", text: "" });
    expect(await prisma.portalLoginLink.count({ where: { emailNormalized: p.email } })).toBe(0);
  });

  it("legacy untagged mail to an address another tenant's candidate also uses is stopped but not edited, and reported", async () => {
    const shared = `shared-${MARKER}@candidate.test`;
    const mine = await person(a, "shared-a", shared);
    const other = await person(b, "shared-b", shared);
    const unsent = await queued(shared);
    const sentRow = await queued(shared, { status: "SENT" });
    const othersTagged = await queued(shared, { companyId: b.companyId, candidateId: other.candidateId });
    const result = await eraseCandidate({ companyId: a.companyId, candidateId: mine.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    expect(result.legacyEmail).toEqual({ sanitized: 0, cancelledOnly: 1, leftAmbiguous: 2 });
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: unsent.id } })).toMatchObject({ status: "CANCELLED", text: SECRET });
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: sentRow.id } })).toMatchObject({ status: "SENT", text: SECRET });
    // The other tenant's tagged row, and the other person, are untouched.
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: othersTagged.id } })).toMatchObject({ status: "FAILED", text: SECRET });
    expect((await prisma.applicationIngestionEvent.findFirstOrThrow({ where: { candidateId: other.candidateId } })).applicantEmailNormalized).toBe(shared);
    await sweep();
    expect(sentTo(shared)).toBe(1);
  });

  it("if the legacy-mail step fails, the steps that destroy the address wait for the retry", async () => {
    const p = await person(a, "blocked");
    const delegate = prisma.outboundEmailAttempt;
    const real = delegate.updateMany.bind(delegate) as (args: unknown) => Promise<unknown>;
    let calls = 0;
    vi.spyOn(delegate, "updateMany").mockImplementation(((args: unknown) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("db blip")) : real(args);
    }) as never);
    const first = await eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    expect(first.status).toBe("PARTIAL");
    expect(first.failedSteps).toEqual(expect.arrayContaining(["queued-email", "identity", "hosted-submissions"]));
    expect((await prisma.applicationIngestionEvent.findFirstOrThrow({ where: { candidateId: p.candidateId } })).applicantEmailNormalized).toBe(p.email);
    const legacy = await queued(p.email);
    const second = await eraseCandidate({ companyId: a.companyId, candidateId: p.candidateId, trigger: "ADMIN_REQUEST", deps: ok });
    expect(second.failedSteps).toEqual([]);
    expect(second.status).toBe("COMPLETED");
    expect(await prisma.outboundEmailAttempt.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ text: "", status: "CANCELLED" });
  });
});
