import { afterAll, describe, expect, it } from "vitest";
import { JobSpecificationVersionStatus, JobStatus, PortalRole } from "@prisma/client";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { acceptInboundEvent, createInboundRoute } from "@/lib/inbound/inbound-service";
import { confirmApplicantImport } from "@/lib/imports/import-service";
import { ingestHostedApplySubmission } from "@/lib/ingestion/hosted-apply-ingestion";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

process.env.INBOUND_EMAIL_DOMAIN = "inbound.test";
process.env.INBOUND_EMAIL_WEBHOOK_SECRET = "test-secret";
process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);

const MARKER = `attr-${process.pid}-${Date.now()}`;
const EMAIL = `cross-${MARKER}@example.com`;

describe.skipIf(integrationDatabase.mode === "skip")("cross-channel candidate attribution", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const jobIds: number[] = [];
  const versionIds: number[] = [];
  const distributionIds: number[] = [];
  const tokenIds: number[] = [];
  const submissionIds: number[] = [];
  const batchIds: number[] = [];
  const routeIds: number[] = [];
  const messageIds: number[] = [];

  afterAll(async () => {
    if (integrationDatabase.mode !== "accept") return;
    const companies = companyIds.filter((id) => id > 0);
    const users = userIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const versions = versionIds.filter((id) => id > 0);
    const distributions = distributionIds.filter((id) => id > 0);
    const tokens = tokenIds.filter((id) => id > 0);
    const submissions = submissionIds.filter((id) => id > 0);
    const batches = batchIds.filter((id) => id > 0);
    const routes = routeIds.filter((id) => id > 0);
    const messages = messageIds.filter((id) => id > 0);
    if (
      companies.length + users.length + jobs.length + versions.length + distributions.length +
        tokens.length + submissions.length + batches.length + routes.length + messages.length ===
      0
    ) {
      return;
    }

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // CandidateEvidence restricts the hosted submission, ingestion event,
    // candidate, application, and company. InboundEmailMessage does not
    // reference evidence, so that delete still runs. CandidateProfile
    // cascades from Candidate. The published-spec pointer is SetNull.
    // AuditLog restricts Company and User, not Job.
    let evidenceGone = companies.length === 0;
    if (companies.length > 0) {
      evidenceGone = await attempt("candidate evidence", () =>
        prisma.candidateEvidence.deleteMany({ where: { companyId: { in: companies } } }));
    }
    let messagesGone = messages.length === 0;
    if (messages.length > 0) {
      messagesGone = await attempt("inbound messages", () =>
        prisma.inboundEmailMessage.deleteMany({ where: { id: { in: messages } } }));
    }
    let rowsGone = batches.length === 0;
    if (batches.length > 0) {
      rowsGone = await attempt("import rows", () =>
        prisma.applicantImportRow.deleteMany({ where: { batchId: { in: batches } } }));
    }
    let ingestionsGone = jobs.length === 0;
    if (evidenceGone && jobs.length > 0) {
      ingestionsGone = await attempt("ingestion events", () =>
        prisma.applicationIngestionEvent.deleteMany({ where: { jobId: { in: jobs } } }));
    } else if (!evidenceGone) {
      ingestionsGone = false;
    }
    let submissionsGone = submissions.length === 0;
    if (evidenceGone && ingestionsGone && submissions.length > 0) {
      submissionsGone = await attempt("hosted submissions", () =>
        prisma.hostedApplySubmission.deleteMany({ where: { id: { in: submissions } } }));
    } else if (!evidenceGone || !ingestionsGone) {
      submissionsGone = submissions.length === 0;
    }
    let tokensGone = tokens.length === 0;
    if (submissionsGone && tokens.length > 0) {
      tokensGone = await attempt("apply tokens", () =>
        prisma.applyToken.deleteMany({ where: { id: { in: tokens } } }));
    } else if (!submissionsGone) {
      tokensGone = false;
    }
    let distributionsGone = distributions.length === 0;
    if (tokensGone && submissionsGone && ingestionsGone && distributions.length > 0) {
      distributionsGone = await attempt("job distributions", () =>
        prisma.jobDistribution.deleteMany({ where: { id: { in: distributions } } }));
    } else if (!tokensGone || !submissionsGone || !ingestionsGone) {
      distributionsGone = false;
    }
    let routesGone = routes.length === 0;
    if (messagesGone && routes.length > 0) {
      routesGone = await attempt("inbound routes", () =>
        prisma.inboundEmailRoute.deleteMany({ where: { id: { in: routes } } }));
    } else if (!messagesGone) {
      routesGone = false;
    }
    let batchesGone = batches.length === 0;
    if (rowsGone && batches.length > 0) {
      batchesGone = await attempt("import batches", () =>
        prisma.applicantImportBatch.deleteMany({ where: { id: { in: batches } } }));
    } else if (!rowsGone) {
      batchesGone = false;
    }
    let applicationsGone = jobs.length === 0;
    if (evidenceGone && ingestionsGone && jobs.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { jobId: { in: jobs } } }));
    } else if (!evidenceGone || !ingestionsGone) {
      applicationsGone = false;
    }
    if (companies.length > 0) {
      await attempt("candidate profiles", () =>
        prisma.candidateProfile.deleteMany({ where: { companyId: { in: companies } } }));
    }
    let candidatesGone = companies.length === 0;
    if (evidenceGone && ingestionsGone && applicationsGone && companies.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { companyId: { in: companies } } }));
    } else if (!evidenceGone || !ingestionsGone || !applicationsGone) {
      candidatesGone = false;
    }
    if (jobs.length > 0) {
      await attempt("published specification pointers", () =>
        prisma.job.updateMany({
          where: { id: { in: jobs } },
          data: { currentPublishedSpecificationVersionId: null },
        }));
    }
    let versionsGone = versions.length === 0;
    if (evidenceGone && ingestionsGone && submissionsGone && distributionsGone && versions.length > 0) {
      versionsGone = await attempt("specification versions", () =>
        prisma.jobSpecificationVersion.deleteMany({ where: { id: { in: versions } } }));
    } else if (!evidenceGone || !ingestionsGone || !submissionsGone || !distributionsGone) {
      versionsGone = false;
    }
    let jobsGone = jobs.length === 0;
    if (
      applicationsGone &&
      ingestionsGone &&
      submissionsGone &&
      distributionsGone &&
      batchesGone &&
      routesGone &&
      messagesGone &&
      versionsGone &&
      jobs.length > 0
    ) {
      jobsGone = await attempt("jobs", () => prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    } else if (
      !applicationsGone || !ingestionsGone || !submissionsGone || !distributionsGone ||
      !batchesGone || !routesGone || !messagesGone || !versionsGone
    ) {
      jobsGone = false;
    }
    let auditsGone = companies.length === 0;
    if (companies.length > 0) {
      auditsGone = await attempt("audit logs", () =>
        deleteAuditLogsForTests({ companyId: { in: companies } }));
    }
    let usersGone = users.length === 0;
    if (auditsGone && users.length > 0) {
      usersGone = await attempt("users", () => prisma.user.deleteMany({ where: { id: { in: users } } }));
    } else if (!auditsGone) {
      usersGone = false;
    }
    if (
      evidenceGone &&
      candidatesGone &&
      jobsGone &&
      ingestionsGone &&
      submissionsGone &&
      distributionsGone &&
      batchesGone &&
      routesGone &&
      messagesGone &&
      auditsGone &&
      usersGone &&
      companies.length > 0
    ) {
      await attempt("companies", () => prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Intake attribution fixture cleanup failed.\n${failures.join("\n")}`);
    }
  });

  it("keeps one candidate across hosted apply, import, and inbound email", async () => {
    const company = await prisma.company.create({
      data: { name: `${MARKER} co`, industry: "Software", employees: 3, publicSlug: MARKER.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) },
    });
    companyIds.push(company.id);
    const user = await prisma.user.create({
      data: { email: `${MARKER}@hireiq.test`, name: "Attr", role: PortalRole.ADMIN, passwordHash: "not-a-login", companyId: company.id },
    });
    userIds.push(user.id);

    async function openJob(label: string) {
      const job = await prisma.job.create({ data: { title: `${label} role`, companyId: company.id, status: JobStatus.OPEN } });
      jobIds.push(job.id);
      const spec = await prisma.jobSpecificationVersion.create({
        data: { jobId: job.id, versionNumber: 1, status: JobSpecificationVersionStatus.PUBLISHED, title: job.title, publishedAt: new Date() },
      });
      versionIds.push(spec.id);
      return { job, spec };
    }

    const first = await openJob("hosted");
    const distribution = await prisma.jobDistribution.create({
      data: {
        companyId: company.id,
        jobId: first.job.id,
        jobSpecificationVersionId: first.spec.id,
        provider: "MANUAL",
        applyMode: "HIREIQ_HOSTED",
        status: "PUBLISHED",
      },
    });
    distributionIds.push(distribution.id);
    const token = await prisma.applyToken.create({
      data: { distributionId: distribution.id, tokenHash: `${MARKER}-token` },
    });
    tokenIds.push(token.id);
    const submission = await prisma.hostedApplySubmission.create({
      data: {
        applyTokenId: token.id,
        distributionId: distribution.id,
        companyId: company.id,
        jobId: first.job.id,
        jobSpecificationVersionId: first.spec.id,
        idempotencyKey: `${MARKER}-hosted`,
        emailNormalized: EMAIL,
        name: "Cross Channel",
        consentAcceptedAt: new Date(),
        profilePayload: { aiPreference: "ALLOWED" },
      },
    });
    submissionIds.push(submission.id);
    await ingestHostedApplySubmission(submission.id);

    const second = await openJob("import");
    const imported = await confirmApplicantImport({
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: second.job.id,
      filename: "people.csv",
      bytes: Buffer.from(`Full name,Email\nCross Channel,${EMAIL}\n`),
      mapping: { name: "Full name", email: "Email" },
      decisions: {},
    });
    if (imported.ok) batchIds.push(imported.batch.id);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.batch.attachedCount).toBe(1);

    const third = await openJob("inbound");
    const route = await createInboundRoute({ companyId: company.id, jobId: third.job.id, actorUserId: user.id, actorRole: user.role });
    if (route.ok) routeIds.push(route.route.id);
    expect(route.ok && route.route.address).toBeTruthy();
    if (!route.ok || !route.route.address) return;
    const inbound = await acceptInboundEvent({
      eventId: `${MARKER}-mail`,
      recipient: route.route.address,
      applicantName: "Cross Channel",
      applicantEmail: EMAIL,
      attachments: [{ fileName: "resume.txt", contentBase64: Buffer.from("Cross Channel resume").toString("base64") }],
    });
    if (inbound.ok) messageIds.push(inbound.message.id);
    expect(inbound.ok).toBe(true);

    const candidates = await prisma.candidate.findMany({ where: { companyId: company.id }, select: { id: true } });
    expect(candidates).toHaveLength(1);
    const applications = await prisma.application.findMany({
      where: { companyId: company.id },
      select: { jobId: true, candidateId: true, aiPreference: true, consentAt: true },
    });
    expect(applications).toHaveLength(3);
    expect(new Set(applications.map((row) => row.candidateId)).size).toBe(1);
    const hostedApp = applications.find((row) => row.jobId === first.job.id);
    expect(hostedApp).toMatchObject({ aiPreference: "ALLOWED", consentAt: null });
    expect(applications.filter((row) => row.jobId !== first.job.id).every((row) => row.aiPreference === "UNKNOWN" && row.consentAt == null)).toBe(true);

    const channels = await prisma.applicationIngestionEvent.findMany({
      where: { companyId: company.id },
      select: { sourceChannel: true, jobId: true, externalApplicationId: true, distributionId: true },
    });
    expect(channels.map((row) => row.sourceChannel).sort()).toEqual(["HOSTED_APPLY", "MANUAL", "MANUAL"]);
    expect(channels.find((row) => row.jobId === first.job.id)?.distributionId).toBe(distribution.id);
    expect(channels.some((row) => row.externalApplicationId?.startsWith("import:"))).toBe(true);
    expect(channels.some((row) => row.externalApplicationId?.startsWith("inbound:"))).toBe(true);

    const duplicate = await confirmApplicantImport({
      companyId: company.id,
      actorUserId: user.id,
      actorRole: user.role,
      jobId: second.job.id,
      filename: "again.csv",
      bytes: Buffer.from(`Full name,Email\nCross Channel ,${EMAIL}\n`),
      mapping: { name: "Full name", email: "Email" },
      decisions: {},
    });
    if (duplicate.ok) batchIds.push(duplicate.batch.id);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(duplicate.batch.rows[0]?.code).toBe("ALREADY_APPLIED");
    expect(await prisma.application.count({ where: { companyId: company.id } })).toBe(3);
    expect((await prisma.application.findFirstOrThrow({ where: { jobId: first.job.id } })).aiPreference).toBe("ALLOWED");
  }, 30000);
});
