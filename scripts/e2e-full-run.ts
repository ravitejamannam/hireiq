/**
 * Fresh-data end-to-end probe. Records failures. Does not change product code.
 * Requires DATABASE_URL to name hireiq_e2e_full.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { PrismaClient } from "@prisma/client";

import { assertAuditLogTriggers } from "@/lib/audit/assert-audit-trigger";
import { mintHostedApplyTokenMaterial } from "@/lib/apply/apply-token";
import { submitHostedApply } from "@/lib/apply/hosted-apply-service";
import { storePendingHostedResume } from "@/lib/apply/hosted-resume-service";
import { hashPassword } from "@/lib/auth/password";
import { answerCopilot } from "@/lib/copilot/copilot-service";
import { recordCompanyFairness } from "@/lib/fairness/monitor";
import { saveSelfIdentification } from "@/lib/fairness/self-id";
import {
  acceptGeneratedJobDescriptionForActor,
  generateJobDescriptionForActor,
} from "@/lib/jobs/job-description-ai";
import { createPostedRequirementForCompany } from "@/lib/jobs/posted-requirement";
import { publishDraftSpecification } from "@/lib/jobs/job-specification";
import { prisma } from "@/lib/prisma";
import { listReviewQueue, reviewApplicationDetail } from "@/lib/review/review-queue-service";
import { loadTalentRediscovery, runTalentRediscovery } from "@/lib/talent/rediscovery-service";

type Finding = {
  severity: "P0" | "P1" | "P2" | "P3";
  area: string;
  actual: string;
  expected: string;
};

const findings: Finding[] = [];
const passes: string[] = [];

function note(ok: boolean, label: string, finding?: Finding) {
  if (ok) passes.push(label);
  else if (finding) findings.push(finding);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

function assertDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("hireiq_e2e_full")) {
    throw new Error("Refusing to run unless DATABASE_URL points at hireiq_e2e_full.");
  }
}

async function main() {
  assertDb();
  const started = Date.now();
  await assertAuditLogTriggers();
  passes.push("audit triggers present");

  const owner = new PrismaClient();
  const denied = await owner.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`;
  const appUser = denied[0]?.current_user ?? "";
  note(appUser === "hireiq_app", `connected as ${appUser}`, {
    severity: "P1",
    area: "fresh environment",
    expected: "hireiq_app",
    actual: appUser,
  });
  let auditWriteBlocked = false;
  try {
    await prisma.$executeRaw`UPDATE "AuditLog" SET action = action WHERE false`;
    auditWriteBlocked = false;
  } catch {
    auditWriteBlocked = true;
  }
  note(auditWriteBlocked, "restricted role cannot UPDATE AuditLog", {
    severity: "P0",
    area: "fresh environment",
    expected: "UPDATE on AuditLog fails for hireiq_app",
    actual: "UPDATE was allowed",
  });
  await owner.$disconnect();

  const passwordHash = await hashPassword("E2e-full-test-pass-1");
  const companies = [
    { slug: "nimbus", name: "Nimbus Labs", industry: "Technology", employees: 80 },
    { slug: "kaveri", name: "Kaveri Retail", industry: "Retail", employees: 400 },
  ];
  const jobs = [
    { key: "tech", title: "Backend Engineer", category: "ENGINEERING", skills: "Go, PostgreSQL, Kubernetes", must: "5 years backend systems", nice: "gRPC", exp: "5-9" },
    { key: "sales", title: "Inside Sales", category: "SALES", skills: "CRM, negotiation, Hindi", must: "2 years B2B sales in India", nice: "inside sales tools", exp: "2-5" },
    { key: "fresher", title: "Graduate Trainee", category: "GRADUATE", skills: "communication, Excel", must: "Bachelor degree, 2024 or 2025", nice: "internship", exp: "0-1" },
  ];
  const controls = [
    { tone: "startup" as const, length: "short" as const, india: { ctcInLpa: true, noticePeriod: true, cityOrHybrid: true } },
    { tone: "corporate" as const, length: "detailed" as const, india: { ctcInLpa: true, noticePeriod: false, cityOrHybrid: false } },
    { tone: "friendly" as const, length: "standard" as const, india: { ctcInLpa: false, noticePeriod: true, cityOrHybrid: true } },
  ];

  const manifest: Record<string, unknown> = { companies: {} as Record<string, unknown> };

  for (const companyDef of companies) {
    const company = await prisma.company.create({
      data: { name: companyDef.name, industry: companyDef.industry, employees: companyDef.employees, publicSlug: `e2e-${companyDef.slug}` },
    });
    const users: Record<string, number> = {};
    for (const spec of [
      { key: "admin", role: "CLIENT" as const, member: "OWNER" as const },
      { key: "recruiter1", role: "CLIENT" as const, member: "MEMBER" as const },
      { key: "recruiter2", role: "CLIENT" as const, member: "MEMBER" as const },
    ]) {
      const user = await prisma.user.create({
        data: {
          email: `${spec.key}.${companyDef.slug}@e2e.hireiq.local`,
          name: `${companyDef.name} ${spec.key}`,
          role: spec.role,
          passwordHash,
          emailVerifiedAt: new Date(),
          companyId: company.id,
        },
      });
      await prisma.organizationMember.create({
        data: { companyId: company.id, userId: user.id, role: spec.member, status: "ACTIVE" },
      });
      users[spec.key] = user.id;
    }
    for (const key of ["interviewer1", "interviewer2"]) {
      const interviewer = await prisma.interviewer.create({
        data: { name: `${companyDef.name} ${key}`, category: "ENGINEERING", availability: "AVAILABLE" },
      });
      const user = await prisma.user.create({
        data: {
          email: `${key}.${companyDef.slug}@e2e.hireiq.local`,
          name: `${companyDef.name} ${key}`,
          role: "INTERVIEWER",
          passwordHash,
          emailVerifiedAt: new Date(),
          interviewerId: interviewer.id,
        },
      });
      users[key] = user.id;
      users[`${key}Profile`] = interviewer.id;
    }

    const companyJobs: Array<Record<string, unknown>> = [];
    for (let index = 0; index < jobs.length; index += 1) {
      const role = jobs[index]!;
      const posted = await createPostedRequirementForCompany({
        companyId: company.id,
        createdByUserId: users.admin,
        title: `${companyDef.name}: ${role.title}`,
        clientCreateIdempotencyKey: `e2e-${companyDef.slug}-${role.key}`,
        fields: {
          roleCategory: role.category,
          experienceRange: role.exp,
          location: index === 2 ? "Pune" : "Bengaluru",
          primarySkills: role.skills,
          mustHaveRequirements: role.must,
          niceToHaveRequirements: role.nice,
          jobDescription: `${role.title} at ${companyDef.name}. India.`,
          evaluationCriteria: "Evidence from the resume and a work sample.",
          compensationRange: "12-24 LPA",
          targetHireDate: new Date("2026-12-15T00:00:00.000Z"),
          numberOfPositions: 1,
        },
      });
      let jdError: string | null = null;
      try {
        await generateJobDescriptionForActor({
          jobId: posted.id,
          actor: { userId: users.admin!, companyId: company.id, isAdmin: false },
          controls: controls[index],
        });
        await acceptGeneratedJobDescriptionForActor({
          jobId: posted.id,
          actor: { userId: users.admin!, companyId: company.id, isAdmin: false },
        });
        await prisma.$transaction((tx) => publishDraftSpecification({ jobId: posted.id, createdByUserId: users.admin, db: tx }));
      } catch (error) {
        jdError = error instanceof Error ? error.message : String(error);
      }
      const spec = await prisma.jobSpecificationVersion.findFirst({
        where: { jobId: posted.id, status: "PUBLISHED" },
        orderBy: { id: "desc" },
        select: { id: true, jobDescription: true, structuredPayload: true },
      });
      const minted = mintHostedApplyTokenMaterial();
      const distribution = await prisma.jobDistribution.create({
        data: {
          jobId: posted.id,
          companyId: company.id,
          jobSpecificationVersionId: spec?.id ?? posted.currentPublishedSpecificationVersionId!,
          provider: "MANUAL",
          applyMode: "HIREIQ_HOSTED",
          status: "PUBLISHED",
          applyUrlSnapshot: minted.applyUrl,
        },
      });
      await prisma.applyToken.create({ data: { distributionId: distribution.id, tokenHash: minted.tokenHash } });
      await prisma.job.update({
        where: { id: posted.id },
        data: { assignedInterviewerId: users[index === 0 ? "interviewer1Profile" : "interviewer2Profile"] },
      });
      const description = spec?.jobDescription ?? "";
      note(Boolean(description) && !jdError, `${companyDef.slug} ${role.key} JD`, jdError ? {
        severity: "P1",
        area: "JD generator",
        expected: "generated, accepted, published",
        actual: jdError,
      } : undefined);
      companyJobs.push({
        key: role.key,
        jobId: posted.id,
        specId: spec?.id,
        applyToken: minted.applyUrl.split("/apply/")[1] ?? "",
        jdChars: description.length,
        tone: controls[index]?.tone,
        hasRubric: JSON.stringify(spec?.structuredPayload ?? {}).includes("scoringRubric"),
      });
    }
    (manifest.companies as Record<string, unknown>)[companyDef.slug] = { companyId: company.id, users, jobs: companyJobs };
  }

  const pdfs = execFileSync("find", [".data/resumes/annotated-ner/pdf", "-type", "f", "-name", "*.pdf"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(0, Number(process.env.E2E_RESUME_CAP ?? "8"));
  const cap = pdfs.length;
  const companyEntries = Object.entries(manifest.companies as Record<string, { jobs: Array<{ key: string; jobId: number; applyToken: string }> }>);
  const applyResults: Array<Record<string, unknown>> = [];
  for (const [slug, company] of companyEntries) {
    const tech = company.jobs.find((job) => job.key === "tech")!;
    for (let index = 0; index < pdfs.length; index += 1) {
      const file = pdfs[index]!;
      const bytes = readFileSync(file);
      const email = index === 0 ? "shared.person@example.com" : `person-${slug}-${index}@example.com`;
      try {
        const pending = await storePendingHostedResume({
          applyTokenRaw: tech.applyToken,
          fileName: basename(file),
          contentType: "application/pdf",
          bytes,
        });
        const submitted = await submitHostedApply({
          token: tech.applyToken,
          idempotencyKey: randomUUID(),
          resumeClaim: pending.resumeClaim,
          body: {
            name: `Applicant ${slug} ${index}`,
            email,
            consent: true,
            location: "Bengaluru",
            experienceYears: index % 7,
            futureRolesConsent: index % 2 === 0,
            aiEvaluationOptOut: index % 5 === 0,
            humanReviewRequested: index % 4 === 0,
          },
        });
        applyResults.push({ slug, file: basename(file), parse: pending.parseStatus, error: pending.parseErrorCode, submitted: submitted.success });
      } catch (error) {
        applyResults.push({ slug, file: basename(file), error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const badDir = "/tmp/hireiq-e2e-bad";
  mkdirSync(badDir, { recursive: true });
  writeFileSync(`${badDir}/fake.zip`, Buffer.from("PK\x03\x04not-a-real-resume"));
  writeFileSync(`${badDir}/scan.png`, Buffer.from("89504E470D0A1A0A", "hex"));
  writeFileSync(`${badDir}/legacy.doc`, Buffer.from("this is not a word document"));
  const nimbusTech = (manifest.companies as { nimbus: { jobs: Array<{ applyToken: string }> } }).nimbus.jobs[0]!;
  for (const file of ["fake.zip", "scan.png", "legacy.doc"]) {
    try {
      await storePendingHostedResume({
        applyTokenRaw: nimbusTech.applyToken,
        fileName: file,
        bytes: readFileSync(`${badDir}/${file}`),
      });
      applyResults.push({ slug: "nimbus", file, error: null });
    } catch (error) {
      applyResults.push({ slug: "nimbus", file, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const shared = await prisma.hostedApplySubmission.findMany({
    where: { emailNormalized: "shared.person@example.com" },
    select: { companyId: true, jobId: true },
  });
  const sharedCompanies = new Set(shared.map((row) => row.companyId));
  note(sharedCompanies.size === 2, "same email created submissions in both companies", {
    severity: "P1",
    area: "applicants",
    expected: "one submission in each company",
    actual: `companies ${[...sharedCompanies].join(",") || "none"}`,
  });

  const nimbus = (manifest.companies as { nimbus: { companyId: number; users: Record<string, number>; jobs: Array<{ jobId: number; key: string }> } }).nimbus;
  const kaveri = (manifest.companies as { kaveri: { companyId: number; users: Record<string, number>; jobs: Array<{ jobId: number; key: string }> } }).kaveri;
  const bJob = kaveri.jobs[0]!.jobId;
  const bQueue = await listReviewQueue({ jobId: bJob, filters: { stage: "", minScore: "", maxScore: "", knockout: "", parse: "", human: "" }, page: 1 });
  note(false, "review queue service scopes to the caller", {
    severity: "P0",
    area: "isolation",
    expected: "listing company B's job without a company check is refused",
    actual: `listReviewQueue(job ${bJob}) returned ${bQueue.rows.length} rows for title ${bQueue.job.title}`,
  });

  const bApplication = await prisma.application.findFirst({ where: { companyId: kaveri.companyId }, select: { id: true, candidateId: true, candidate: { select: { name: true } } } });
  if (bApplication) {
    const crossed = await reviewApplicationDetail({ applicationId: bApplication.id, companyId: nimbus.companyId });
    note(crossed == null, "review detail hides the other company's application", {
      severity: "P0",
      area: "isolation",
      expected: "null",
      actual: crossed ? `leaked ${bApplication.candidate.name}` : "null",
    });
    const self = await saveSelfIdentification({ candidateId: bApplication.candidateId, companyId: nimbus.companyId, gender: "woman" }).then(() => "saved").catch((error: Error) => error.message);
    note(/company|foreign|violat|not found/i.test(self), "self-ID write is rejected when the company id does not own the candidate", {
      severity: "P0",
      area: "isolation",
      expected: "rejected",
      actual: self.slice(0, 240),
    });
  } else {
    findings.push({ severity: "P2", area: "applicants", expected: "Kaveri has an application", actual: "no application row" });
  }

  let copilotLeak = "";
  try {
    const answer = await answerCopilot({
      actor: { userId: nimbus.users.recruiter1!, role: "CLIENT", companyId: nimbus.companyId, interviewerId: null },
      companyId: nimbus.companyId,
      jobId: bJob,
      question: "Top 5 for Kubernetes",
    });
    copilotLeak = answer.answer;
  } catch (error) {
    copilotLeak = error instanceof Error ? error.message : String(error);
  }
  const leaked = /kaveri|applicant kaveri/i.test(copilotLeak) || (!/cannot access|not found|don't have/i.test(copilotLeak) && copilotLeak.length > 0 && !copilotLeak.includes("fewer than 5") && !copilotLeak.includes("don't have"));
  note(!leaked && /cannot access|not found|Job not found|You cannot/i.test(copilotLeak), "copilot refuses company B's job for a Nimbus recruiter treated as admin", {
    severity: "P0",
    area: "isolation",
    expected: "access refused",
    actual: copilotLeak.slice(0, 240),
  });

  const interviewerAnswer = await answerCopilot({
    actor: { userId: nimbus.users.interviewer1!, role: "INTERVIEWER", companyId: null, interviewerId: nimbus.users.interviewer1Profile! },
    companyId: nimbus.companyId,
    jobId: bJob,
    question: "Who is in this pipeline?",
  }).then((result) => result.answer).catch((error: Error) => error.message);
  note(/cannot access|not found/i.test(interviewerAnswer), "copilot refuses company B's job for a Nimbus interviewer", {
    severity: "P0",
    area: "isolation",
    expected: "access refused",
    actual: interviewerAnswer.slice(0, 240),
  });

  const runs = await prisma.aIRun.groupBy({ by: ["feature"], _count: { _all: true }, _sum: { promptTokens: true, completionTokens: true } });
  const optOutRuns = await prisma.aIRun.count({ where: { status: { not: "ok" } } });

  const scaleJob = await createPostedRequirementForCompany({
    companyId: nimbus.companyId,
    createdByUserId: nimbus.users.admin,
    title: "Nimbus Labs: Scale queue",
    clientCreateIdempotencyKey: "e2e-nimbus-scale",
    fields: {
      roleCategory: "ENGINEERING",
      primarySkills: "Go",
      mustHaveRequirements: "Backend",
      niceToHaveRequirements: "Kubernetes",
      jobDescription: "Scale queue role.",
      evaluationCriteria: "Resume evidence.",
      experienceRange: "3-6",
      location: "Bengaluru",
      compensationRange: "12-24 LPA",
      targetHireDate: new Date("2026-12-15T00:00:00.000Z"),
      numberOfPositions: 1,
    },
  });
  const scaleStarted = Date.now();
  for (let batch = 0; batch < 5; batch += 1) {
    const created = await prisma.candidate.createManyAndReturn({
      data: Array.from({ length: 100 }, (_, index) => ({
        companyId: nimbus.companyId,
        name: `Scale ${batch}-${index}`,
        role: "Engineer",
        experienceYears: index % 10,
        status: "APPLIED" as const,
      })),
    });
    await prisma.application.createMany({
      data: created.map((candidate) => ({
        candidateId: candidate.id,
        jobId: scaleJob.id,
        companyId: nimbus.companyId,
      })),
    });
  }
  const insertMs = Date.now() - scaleStarted;
  const pageStarted = Date.now();
  const page = await listReviewQueue({ jobId: scaleJob.id, filters: { stage: "", minScore: "", maxScore: "", knockout: "", parse: "", human: "" }, page: 1 });
  const pageMs = Date.now() - pageStarted;

  let rediscovery = "not run";
  try {
    const second = nimbus.jobs.find((job) => job.key === "sales");
    if (second) {
      const ranked = await runTalentRediscovery({ jobId: second.jobId });
      rediscovery = `${ranked.length} results`;
    }
  } catch (error) {
    rediscovery = error instanceof Error ? error.message : String(error);
    findings.push({ severity: "P1", area: "rediscovery", expected: "a completed run", actual: rediscovery.slice(0, 300) });
  }

  let fairness = "not run";
  try {
    const report = await recordCompanyFairness(nimbus.companyId);
    fairness = JSON.stringify(report).slice(0, 400);
  } catch (error) {
    fairness = error instanceof Error ? error.message : String(error);
    findings.push({ severity: "P2", area: "fairness", expected: "a snapshot", actual: fairness.slice(0, 300) });
  }

  const report = {
    elapsedMs: Date.now() - started,
    passes,
    findings,
    applyResults,
    resumeCap: cap,
    shared,
    copilotLeak,
    interviewerAnswer,
    aiRuns: runs,
    optOutRuns,
    scale: { insertMs, pageMs, pageCount: page.rows.length, total: page.total },
    rediscovery,
    fairness,
    manifest,
  };
  writeFileSync("/tmp/hireiq-e2e-full-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passes: passes.length, findings: findings.length, insertMs, pageMs, optOutRuns }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  writeFileSync("/tmp/hireiq-e2e-full-report.json", JSON.stringify({ crash: String(error), findings, passes }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
});
