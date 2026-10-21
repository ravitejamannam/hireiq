import { afterAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobSpecificationVersionStatus, PortalRole } from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { confirmApplicantImport, getImportBatch, previewApplicantFile } from "@/lib/imports/import-service";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `imp-${process.pid}-${Date.now()}`;

describe.skipIf(integrationDatabase.mode === "skip")("applicant import confirmation", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (integrationDatabase.mode !== "accept" || companyIds.length === 0) return;
    await prisma.applicantImportRow.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicantImportBatch.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicantImportTemplate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.applicationIngestionEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.updateMany({
      where: { companyId: { in: companyIds } },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: { companyId: { in: companyIds } } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await deleteAuditLogsForTests({ companyId: { in: companyIds } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  async function workspace(label: string) {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} ${label}`,
        industry: "Software",
        employees: 5,
        publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      },
    });
    companyIds.push(company.id);
    const user = await prisma.user.create({
      data: {
        email: `${MARKER}-${label}@hireiq.test`,
        name: label,
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
        companyId: company.id,
      },
    });
    userIds.push(user.id);
    const job = await prisma.job.create({
      data: { title: `${label} role`, companyId: company.id },
    });
    await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        title: job.title,
        publishedAt: new Date(),
      },
    });
    return { company, user, job };
  }

  it("previews without writes, confirms once, and ignores a repeated confirmation", async () => {
    const { company, user, job } = await workspace("alpha");
    const csv = Buffer.from(
      "Full name,Email,Current employer\nAda Lovelace,ada-import@example.com,Analytical\nGrace Hopper,grace-import@example.com,Navy\n",
    );
    const mapping = { name: "Full name", email: "Email", currentEmployer: "Current employer" };
    const before = await prisma.candidate.count({ where: { companyId: company.id } });
    const preview = await previewApplicantFile({
      companyId: company.id,
      jobId: job.id,
      filename: "people.csv",
      bytes: csv,
      mapping,
    });
    expect(preview.ok).toBe(true);
    expect(await prisma.candidate.count({ where: { companyId: company.id } })).toBe(before);
    expect(await prisma.application.count({ where: { companyId: company.id } })).toBe(0);

    const first = await confirmApplicantImport({
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: job.id,
      filename: "people.csv",
      bytes: csv,
      mapping,
      decisions: {},
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.batch.createdCount).toBe(2);
    const applications = await prisma.application.findMany({
      where: { companyId: company.id },
      select: { aiPreference: true, consentAt: true, candidateId: true },
    });
    expect(applications).toHaveLength(2);
    expect(applications.every((row) => row.aiPreference === "UNKNOWN" && row.consentAt == null)).toBe(true);

    const second = await confirmApplicantImport({
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: job.id,
      filename: "people.csv",
      bytes: csv,
      mapping,
      decisions: {},
    });
    expect(second.ok && second.repeated).toBe(true);
    expect(await prisma.application.count({ where: { companyId: company.id } })).toBe(2);

    const audit = await prisma.auditLog.findMany({
      where: { companyId: company.id, action: { in: ["IMPORT_CONFIRMED", "IMPORT_COMPLETED"] } },
    });
    expect(audit.map((row) => row.action).sort()).toEqual(["IMPORT_COMPLETED", "IMPORT_CONFIRMED"]);
    expect(audit.every((row) => !row.reason?.includes("@"))).toBe(true);

    const again = Buffer.from("Full name,Email\nAda Lovelace,ada-import@example.com\n");
    const attached = await confirmApplicantImport({
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: job.id,
      filename: "second.csv",
      bytes: again,
      mapping: { name: "Full name", email: "Email" },
      decisions: {},
    });
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    expect(attached.batch.attachedCount + attached.batch.skippedCount).toBeGreaterThan(0);
    expect(attached.batch.createdCount).toBe(0);
    expect(await prisma.candidate.count({ where: { companyId: company.id, status: CandidateStatus.APPLIED } })).toBe(2);
  }, 20000);

  it("does not import another company's candidate id", async () => {
    const alpha = await workspace("beta");
    const other = await workspace("gamma");
    const outsider = await prisma.candidate.create({
      data: {
        name: "Other Person",
        role: "Role",
        experienceYears: 1,
        status: CandidateStatus.APPLIED,
        companyId: other.company.id,
      },
    });
    const csv = Buffer.from("Full name,Email\nNew Person,new-import@example.com\n");
    const result = await confirmApplicantImport({
      companyId: alpha.company.id,
      actorUserId: alpha.user.id,
      actorRole: alpha.user.role,
      jobId: alpha.job.id,
      filename: "one.csv",
      bytes: csv,
      mapping: { name: "Full name", email: "Email" },
      decisions: { "2": outsider.id },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.rows[0]?.code).toBe("STALE_MATCH");
    expect(await prisma.application.count({ where: { candidateId: outsider.id } })).toBe(0);
    const missing = await previewApplicantFile({
      companyId: alpha.company.id,
      jobId: other.job.id,
      filename: "one.csv",
      bytes: csv,
      mapping: { name: "Full name", email: "Email" },
    });
    expect(missing.ok).toBe(false);
    expect(await getImportBatch(other.company.id, result.batch.id)).toBeNull();
    expect(await getImportBatch(alpha.company.id, result.batch.id)).toMatchObject({
      id: result.batch.id,
      jobId: alpha.job.id,
    });
  });

  it("serializes concurrent confirmation and resumes a partial batch", async () => {
    const { company, user, job } = await workspace("delta");
    const csv = Buffer.from(
      "Full name,Email\nAda Lovelace,ada-delta@example.com\nGrace Hopper,grace-delta@example.com\n",
    );
    const mapping = { name: "Full name", email: "Email" };
    const input = {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: job.id,
      filename: "delta.csv",
      bytes: csv,
      mapping,
      decisions: {},
    };
    const [first, second] = await Promise.all([
      confirmApplicantImport(input),
      confirmApplicantImport(input),
    ]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.batch.id).toBe(second.batch.id);
    expect([first.repeated, second.repeated].filter(Boolean)).toHaveLength(1);
    const applications = await prisma.application.findMany({
      where: { companyId: company.id, jobId: job.id },
      select: { id: true, status: true, candidateId: true, consentAt: true },
    });
    expect(applications).toHaveLength(2);
    expect(applications.every((row) => row.status === "CV_POOL" && row.consentAt == null)).toBe(true);

    const droppedApplicationId = first.batch.rows.find((row) => row.rowNumber === 3)?.applicationId ?? -1;
    await prisma.applicantImportRow.deleteMany({
      where: { batchId: first.batch.id, rowNumber: 3 },
    });
    await prisma.applicationIngestionEvent.deleteMany({
      where: { applicationId: droppedApplicationId },
    });
    await prisma.application.deleteMany({ where: { id: droppedApplicationId } });
    await prisma.applicantImportBatch.update({
      where: { id: first.batch.id },
      data: { status: "CONFIRMED", completedAt: null, createdCount: 1 },
    });
    const resumed = await confirmApplicantImport(input);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.repeated).toBe(false);
    expect(await prisma.application.count({ where: { companyId: company.id, jobId: job.id } })).toBe(2);
    expect(resumed.batch.rows.map((row) => row.rowNumber).sort()).toEqual([2, 3]);
  }, 20000);

  it("does not attach a stale candidate id", async () => {
    const { company, user, job } = await workspace("echo");
    const stale = await prisma.candidate.create({
      data: {
        name: "Stale Person",
        role: "Role",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
        erasedAt: new Date(),
      },
    });
    await prisma.applicationIngestionEvent.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        jobSpecificationVersionId: (
          await prisma.jobSpecificationVersion.findFirstOrThrow({ where: { jobId: job.id } })
        ).id,
        sourceChannel: "MANUAL",
        status: "PROCESSED",
        applicantName: "Stale Person",
        applicantEmailNormalized: "stale-import@example.com",
        candidateId: stale.id,
      },
    });
    const result = await confirmApplicantImport({
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: job.id,
      filename: "stale.csv",
      bytes: Buffer.from("Full name,Email\nStale Person,stale-import@example.com\n"),
      mapping: { name: "Full name", email: "Email" },
      decisions: { "2": stale.id },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.rows[0]?.code).toMatch(/erased|STALE_MATCH/);
    expect(await prisma.application.count({ where: { candidateId: stale.id } })).toBe(0);
  });
});
