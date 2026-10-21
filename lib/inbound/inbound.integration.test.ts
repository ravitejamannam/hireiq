import { afterAll, afterEach, describe, expect, it } from "vitest";
import { JobSpecificationVersionStatus, JobStatus, PortalRole } from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { acceptInboundEvent, createInboundRoute, getInboundMessage, retryInboundEmailMessage, setInboundResumeParserForTests, setInboundRouteEnabled } from "@/lib/inbound/inbound-service";
import { setAttachmentScannerForTests } from "@/lib/inbound/attachment-scan";
import type { InboundEmailEvent } from "@/lib/inbound/contract";
import { prisma } from "@/lib/prisma";
import { deleteResume } from "@/lib/resumes/storage";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

process.env.INBOUND_EMAIL_DOMAIN = "inbound.test";
process.env.INBOUND_EMAIL_WEBHOOK_SECRET = "test-secret";
process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);

const MARKER = `inb-${process.pid}-${Date.now()}`;

function event(token: string, overrides: Partial<InboundEmailEvent> = {}): InboundEmailEvent {
  return {
    eventId: `${MARKER}-${Math.random().toString(36).slice(2)}`,
    recipient: `${token}@inbound.test`,
    applicantName: "Ada Lovelace",
    applicantEmail: `ada-${MARKER}@example.com`,
    attachments: [{ fileName: "resume.txt", contentBase64: Buffer.from("Resume text for Ada").toString("base64") }],
    ...overrides,
  };
}

describe.skipIf(integrationDatabase.mode === "skip")("inbound applicant email", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterEach(() => {
    setInboundResumeParserForTests(null);
    setAttachmentScannerForTests(null);
  });

  afterAll(async () => {
    if (integrationDatabase.mode !== "accept" || companyIds.length === 0) return;
    await prisma.inboundEmailMessage.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.inboundEmailRoute.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicationIngestionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.updateMany({ where: { companyId: { in: companyIds } }, data: { currentPublishedSpecificationVersionId: null } });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: { companyId: { in: companyIds } } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await deleteAuditLogsForTests({ companyId: { in: companyIds } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  async function workspace(label: string) {
    const company = await prisma.company.create({
      data: { name: `${MARKER} ${label}`, industry: "Software", employees: 4, publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) },
    });
    companyIds.push(company.id);
    const user = await prisma.user.create({
      data: { email: `${MARKER}-${label}@hireiq.test`, name: label, role: PortalRole.ADMIN, passwordHash: "not-a-login", companyId: company.id },
    });
    userIds.push(user.id);
    const job = await prisma.job.create({ data: { title: `${label} role`, companyId: company.id, status: JobStatus.OPEN } });
    await prisma.jobSpecificationVersion.create({
      data: { jobId: job.id, versionNumber: 1, status: JobSpecificationVersionStatus.PUBLISHED, title: job.title, publishedAt: new Date() },
    });
    const route = await createInboundRoute({ companyId: company.id, jobId: job.id, actorUserId: user.id, actorRole: user.role });
    if (!route.ok || !route.route.address) throw new Error("route was not created");
    const token = route.route.address.split("@")[0]!;
    return { company, user, job, token };
  }

  it("creates one application and ignores a duplicate delivery", async () => {
    const { company, job, token } = await workspace("alpha");
    const payload = event(token, { applicantEmail: `ada-${MARKER}-alpha@example.com` });
    const [first, second] = await Promise.all([acceptInboundEvent(payload), acceptInboundEvent(payload)]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const applications = await prisma.application.findMany({
      where: { companyId: company.id, jobId: job.id },
      select: { status: true, aiPreference: true, consentAt: true },
    });
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({ status: "CV_POOL", aiPreference: "UNKNOWN", consentAt: null });
    const audit = await prisma.auditLog.findMany({ where: { companyId: company.id, action: "INBOUND_EMAIL_COMPLETED" } });
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((row) => !row.reason?.includes("@") && !row.reason?.includes(token))).toBe(true);
  }, 20000);

  it("rejects invalid, disabled, and closed routes", async () => {
    const { company, job, token } = await workspace("beta");
    expect((await acceptInboundEvent(event("not-a-real-token"))).ok).toBe(false);
    await setInboundRouteEnabled({ companyId: company.id, jobId: job.id, enabled: false, actorUserId: (await prisma.user.findFirstOrThrow({ where: { companyId: company.id } })).id, actorRole: "ADMIN" });
    expect((await acceptInboundEvent(event(token))).code).toBe("ROUTE_DISABLED");
    await setInboundRouteEnabled({ companyId: company.id, jobId: job.id, enabled: true, actorUserId: (await prisma.user.findFirstOrThrow({ where: { companyId: company.id } })).id, actorRole: "ADMIN" });
    await prisma.job.update({ where: { id: job.id }, data: { status: JobStatus.CLOSED } });
    expect((await acceptInboundEvent(event(token))).code).toBe("JOB_NOT_OPEN");
  });

  it("holds ambiguous matches and recovers a failed message that already has an application", async () => {
    const { company, user, job, token } = await workspace("gamma");
    const email = `shared-${MARKER}@example.com`;
    for (const name of ["One Person", "Two Person"]) {
      const candidate = await prisma.candidate.create({
        data: { name, role: "Role", experienceYears: 1, status: "APPLIED", companyId: company.id },
      });
      await prisma.applicationIngestionEvent.create({
        data: {
          companyId: company.id,
          jobId: job.id,
          candidateId: candidate.id,
          jobSpecificationVersionId: (await prisma.jobSpecificationVersion.findFirstOrThrow({ where: { jobId: job.id } })).id,
          sourceChannel: "MANUAL",
          status: "PROCESSED",
          applicantName: name,
          applicantEmailNormalized: email,
        },
      });
    }
    const ambiguous = await acceptInboundEvent(event(token, { applicantEmail: email, applicantName: "Shared Person" }));
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok) return;
    expect(ambiguous.message.code).toBe("AMBIGUOUS_MATCH");
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(0);

    const created = await acceptInboundEvent(event(token, { applicantEmail: `solo-${MARKER}@example.com`, applicantName: "Solo Person" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await prisma.inboundEmailMessage.update({
      where: { id: created.message.id },
      data: { status: "FAILED", code: "STORAGE_FAILED" },
    });
    const recovered = await retryInboundEmailMessage(company.id, created.message.id);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.message.code).toBe("RECOVERED");
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(1);
    expect(await getInboundMessage(user.companyId ?? -1, created.message.id)).toBeTruthy();
    const other = await prisma.company.create({
      data: { name: `${MARKER} other`, industry: "Software", employees: 1, publicSlug: `${MARKER}-other`.slice(0, 60) },
    });
    companyIds.push(other.id);
    expect(await getInboundMessage(other.id, created.message.id)).toBeNull();
  }, 20000);

  it("does not create an application for a malformed resume", async () => {
    const { company, job, token } = await workspace("delta");
    const result = await acceptInboundEvent(event(token, {
      applicantEmail: `bad-${MARKER}@example.com`,
      attachments: [{ fileName: "resume.pdf", contentBase64: Buffer.from("not a pdf").toString("base64") }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.status).toBe("REVIEW");
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(0);
  });

  it("stores a validated file when parsing fails, then retries from those bytes", async () => {
    const { company, job, token } = await workspace("parse");
    setInboundResumeParserForTests(async () => ({ ok: false, errorCode: "PARSE_TIMEOUT" }));
    const payload = event(token, { applicantEmail: `retry-${MARKER}@example.com`, applicantName: "Retry Person" });
    const failed = await acceptInboundEvent(payload);
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.message.code).toBe("PARSE_TIMEOUT");
    const stored = await prisma.inboundEmailMessage.findUniqueOrThrow({
      where: { id: failed.message.id },
      select: { storageKey: true, malwareScan: true, applicationId: true },
    });
    expect(stored.storageKey).toBeTruthy();
    expect(stored.malwareScan).toBe("unavailable");
    expect(stored.applicationId).toBeNull();
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(0);

    setInboundResumeParserForTests(null);
    const [first, second] = await Promise.all([
      retryInboundEmailMessage(company.id, failed.message.id),
      retryInboundEmailMessage(company.id, failed.message.id),
    ]);
    expect(first.ok && second.ok).toBe(true);
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(1);
    const third = await retryInboundEmailMessage(company.id, failed.message.id);
    expect(third.ok).toBe(true);
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(1);

    const other = companyIds.find((id) => id !== company.id);
    expect(await retryInboundEmailMessage(other ?? -1, failed.message.id)).toMatchObject({ ok: false });
  }, 20000);

  it("does not create an application when the stored file is gone or the scanner rejects it", async () => {
    const { company, job, token } = await workspace("scan");
    setInboundResumeParserForTests(async () => {
      throw new Error("parser should not run");
    });
    setAttachmentScannerForTests({
      async scan() {
        return { status: "infected" };
      },
    });
    const blocked = await acceptInboundEvent(event(token, { applicantEmail: `blocked-${MARKER}@example.com` }));
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.message.code).toBe("MALWARE_REJECTED");
    const blockedRow = await prisma.inboundEmailMessage.findUniqueOrThrow({
      where: { id: blocked.message.id },
      select: { storageKey: true },
    });
    expect(blockedRow.storageKey).toBeNull();

    setAttachmentScannerForTests(null);
    setInboundResumeParserForTests(async () => ({ ok: false, errorCode: "PARSE_TIMEOUT" }));
    const failed = await acceptInboundEvent(event(token, { applicantEmail: `missing-${MARKER}@example.com`, applicantName: "Missing File" }));
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    const row = await prisma.inboundEmailMessage.findUniqueOrThrow({
      where: { id: failed.message.id },
      select: { storageKey: true },
    });
    if (row.storageKey) await deleteResume(row.storageKey);
    setInboundResumeParserForTests(null);
    const missing = await retryInboundEmailMessage(company.id, failed.message.id);
    expect(missing.ok).toBe(false);
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(0);
  }, 20000);

  it("keeps a real parser failure for an invalid docx without an application", async () => {
    const { company, job, token } = await workspace("docx");
    const result = await acceptInboundEvent(event(token, {
      applicantEmail: `docx-${MARKER}@example.com`,
      attachments: [{ fileName: "resume.docx", contentBase64: Buffer.from("PKbad-docx").toString("base64") }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.status).toBe("FAILED");
    const row = await prisma.inboundEmailMessage.findUniqueOrThrow({
      where: { id: result.message.id },
      select: { storageKey: true, code: true },
    });
    expect(row.storageKey).toBeTruthy();
    expect(row.code).toBe("UNSUPPORTED_FORMAT");
    const again = await retryInboundEmailMessage(company.id, result.message.id);
    expect(again.ok).toBe(false);
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(0);
  }, 20000);
});
