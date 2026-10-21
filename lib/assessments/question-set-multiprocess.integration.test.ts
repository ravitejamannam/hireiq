import "@/lib/evidence-graph/evidence-graph-test-env";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { generateAssessmentFromRubric, questionSetKey } from "@/lib/assessments/generated-assessment";
import { sendAssessmentLink } from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

/**
 * Separate Node processes, each with its own Prisma client and connection pool, against one
 * local Postgres. That models several app instances sharing a database. It does not model a
 * pooler in transaction mode, replicas, or a managed database; those stay unverified.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const MARKER = `qsmp-${process.pid}-${Date.now()}`;
const ITEMS = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging", "Data modelling", "Communication"], rubric: [] });

function withPoolLimit(url: string, limit: number) {
  return url.includes("connection_limit=") ? url : `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
}

type Worker = { stdout: () => string; waitFor: (text: string, ms?: number) => Promise<void>; done: Promise<{ code: number | null; out: string; err: string }>; kill: () => void };

function worker(job: object): Worker {
  const child = spawn(join(process.cwd(), "node_modules/.bin/tsx"), ["scripts/question-set-worker.ts", JSON.stringify(job)], {
    // Each worker has its own pool. The default (2 x CPUs + 1) times six workers, plus every other suite's pool, came
    // within a few connections of Postgres max_connections (93 of 100 seen). A small pool keeps the test off that edge.
    env: { ...process.env, DATABASE_URL: withPoolLimit(DATABASE_URL, 4), OPENAI_API_KEY: "", RESEND_API_KEY: "", EMAIL_FROM: "" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => (out += String(chunk)));
  child.stderr.on("data", (chunk) => (err += String(chunk)));
  const done = new Promise<{ code: number | null; out: string; err: string }>((resolve) => child.on("close", (code) => resolve({ code, out, err })));
  return {
    stdout: () => out,
    waitFor: async (text, ms = 60_000) => {
      const until = Date.now() + ms;
      while (!out.includes(text)) {
        if (Date.now() > until) throw new Error(`worker never printed ${text}: ${err}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    done,
    // tsx starts a child node process; kill the whole group so the connection really drops.
    kill: () => process.kill(-child.pid!, "SIGKILL"),
  };
}

function results(output: string) {
  const line = output.split("\n").find((row) => row.startsWith("RESULT "));
  if (!line) throw new Error(`no result in worker output: ${output}`);
  return JSON.parse(line.slice(7)) as Array<{ applicationId: number; inviteId: number; reused: boolean; uniqueSet: boolean }>;
}

describe.skipIf(integrationDatabase.mode === "skip")("question sets across processes", () => {
  let companyId = 0;
  let adminId = 0;
  let jobId = 0;
  let assessmentId = 0;
  const applicationIds: number[] = [];
  const saved = { openai: process.env.OPENAI_API_KEY, resend: process.env.RESEND_API_KEY };

  async function applications(count: number) {
    const created: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const candidate = await prisma.candidate.create({
        data: { name: `qsmp ${applicationIds.length + index}`, role: "Engineer", experienceYears: 3, status: CandidateStatus.APPLIED, companyId },
      });
      const application = await prisma.application.create({ data: { candidateId: candidate.id, jobId, companyId } });
      created.push(application.id);
    }
    applicationIds.push(...created);
    return created;
  }

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "";
    process.env.RESEND_API_KEY = "";
    const company = await prisma.company.create({ data: { name: MARKER, industry: "Test", employees: 5, publicSlug: MARKER } });
    companyId = company.id;
    adminId = (await prisma.user.create({
      data: { email: `${MARKER}@hireiq.test`, name: "admin", role: PortalRole.ADMIN, passwordHash: "not-a-login", emailVerifiedAt: new Date(), companyId },
    })).id;
    jobId = (await prisma.job.create({ data: { title: `${MARKER} role`, status: JobStatus.OPEN, companyId } })).id;
    assessmentId = (await prisma.generatedAssessment.create({
      data: { jobId, companyId, version: 1, status: "PUBLISHED", publishedAt: new Date(), timeLimitMinutes: 20, drawCount: 8, items: ITEMS },
    })).id;
  });

  afterAll(async () => {
    process.env.OPENAI_API_KEY = saved.openai;
    process.env.RESEND_API_KEY = saved.resend;
    if (!companyId) return;
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessmentId } });
    await deleteAuditLogsForTests({ companyId });
    await prisma.generatedAssessment.deleteMany({ where: { companyId } });
    await prisma.application.deleteMany({ where: { companyId } });
    await prisma.candidate.deleteMany({ where: { companyId } });
    await prisma.job.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  it("one application sent many times at once, in one process, yields one invite", async () => {
    const [applicationId] = await applications(1);
    const links = await Promise.all(Array.from({ length: 12 }, () => sendAssessmentLink({ applicationId: applicationId!, actorUserId: adminId, companyId })));
    expect(new Set(links.map((link) => link.inviteId)).size).toBe(1);
    expect(await prisma.generatedAssessmentInvite.count({ where: { applicationId } })).toBe(1);
  });

  it("one application sent from several processes at once yields one invite", async () => {
    const [applicationId] = await applications(1);
    const workers = Array.from({ length: 4 }, () => worker({ mode: "send", companyId, actorUserId: adminId, applicationIds: [applicationId, applicationId, applicationId] }));
    const finished = await Promise.all(workers.map((row) => row.done));
    for (const row of finished) expect(row.code, row.err).toBe(0);
    const ids = new Set(finished.flatMap((row) => results(row.out).map((result) => result.inviteId)));
    expect(ids.size).toBe(1);
    expect(await prisma.generatedAssessmentInvite.count({ where: { applicationId } })).toBe(1);
  }, 120_000);

  it("different applications sent from several processes get distinct sets", async () => {
    const ids = await applications(48);
    const chunks = Array.from({ length: 6 }, (_, index) => ids.slice(index * 8, index * 8 + 8));
    const finished = await Promise.all(chunks.map((chunk) => worker({ mode: "send", companyId, actorUserId: adminId, applicationIds: chunk }).done));
    for (const row of finished) expect(row.code, row.err).toBe(0);
    expect(finished.flatMap((row) => results(row.out))).toHaveLength(48);
    const invites = await prisma.generatedAssessmentInvite.findMany({ where: { applicationId: { in: ids } }, select: { itemOrder: true } });
    expect(invites).toHaveLength(48);
    const keys = invites.map((invite) => questionSetKey((invite.itemOrder as string[]).map(String)));
    expect(new Set(keys).size).toBe(48);
  }, 180_000);

  it("a process killed while holding the lock leaves no invite behind and does not block others", async () => {
    const [stuck, other] = await applications(2);
    const holder = worker({ mode: "hold", assessmentId, applicationId: stuck });
    await holder.waitFor("LOCKED");
    const pending = sendAssessmentLink({ applicationId: other!, actorUserId: adminId, companyId });
    const outcome = await Promise.race([pending.then(() => "finished"), new Promise((resolve) => setTimeout(() => resolve("blocked"), 1500))]);
    expect(outcome).toBe("blocked");
    holder.kill();
    await holder.done;
    const link = await pending;
    expect(link.reused).toBe(false);
    expect(await prisma.generatedAssessmentInvite.count({ where: { applicationId: stuck } })).toBe(0);
    expect(await prisma.generatedAssessmentInvite.count({ where: { applicationId: other } })).toBe(1);
  }, 120_000);
});
