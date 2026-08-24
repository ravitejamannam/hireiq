/**
 * T105: comprehensive demo-world seed — exercises EVERY product feature.
 *
 * Replaces bootstrap-dev.ts + bootstrap-dev-pipeline.ts.
 *
 * Demo world: one showcase company ("Nimbus Labs") with a full hiring
 * lifecycle across two roles, built through REAL service functions
 * (not raw writes) wherever the codebase allows:
 *
 *   hosted apply (+resume claim) → ingestion → evidence → resume document
 *   → assessment invite → scored attempt (with integrity signals)
 *   → matching run → ranking run
 *   → interview blueprint → rubric-scored evaluation
 *   → interviews / coding tests / reports → scheduling slots + booking
 *   → pipeline to HIRED → billing
 *
 * Idempotent: safe to re-run; existing rows are detected and skipped.
 *
 * Usage: pnpm db:bootstrap-dev   (BOOTSTRAP_PASSWORD or ADMIN_PASSWORD)
 */

import "dotenv/config";

import {
  ApplicationPipelineStatus,
  CodingTestStatus,
  InterviewResult,
  InterviewType,
  Recommendation,
  SourcingDatabaseSource,
} from "@prisma/client";

import { hashPassword } from "../lib/auth/password";
import {
  storePendingHostedResume,
} from "../lib/apply/hosted-resume-service";
import { submitHostedApply } from "../lib/apply/hosted-apply-service";
import { mintAssessmentInviteForApplication, submitPublicAssessment } from "../lib/assessments/assessment-service";
import { upsertBlueprintCore, applyRubricScores } from "../lib/interviews/blueprint-service";
import { executeRunCandidateMatching } from "../lib/candidates/matching/matching-service";
import { executeRunJobRanking } from "../lib/candidates/ranking/ranking-service";
import { createPostedJobWithPublishedSpecification } from "../lib/jobs/job-specification";
import { mintHostedApplyTokenMaterial } from "../lib/apply/apply-token";
import { generateBillingForHiredApplication } from "../lib/billing/generate-hire-billing";
import { prisma } from "../lib/prisma";
import {
  UserValidationError,
  validateBootstrapPassword,
} from "../lib/validation/user-validation";

const COMPANY = {
  slug: "nimbus",
  name: "Nimbus Labs",
  industry: "Technology",
  employees: 120,
};

const INTERVIEWERS = [
  { email: "interviewer.arjun@hireiq.local", name: "Arjun Mehta", category: "ENGINEERING" },
  { email: "interviewer.kavya@hireiq.local", name: "Kavya Iyer", category: "PRODUCT" },
];

async function main() {
  const passwordRaw =
    process.env.BOOTSTRAP_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!passwordRaw) {
    console.error("Missing BOOTSTRAP_PASSWORD (or ADMIN_PASSWORD).");
    process.exit(1);
  }
  try {
    validateBootstrapPassword(passwordRaw);
  } catch (error) {
    if (error instanceof UserValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const passwordHash = await hashPassword(passwordRaw);

  // ── 1. Company + clients ────────────────────────────────────────────
  let company = await prisma.company.findFirst({
    where: { name: COMPANY.name },
    select: { id: true, name: true },
  });
  if (!company) {
    company = await prisma.company.create({
      data: { name: COMPANY.name, industry: COMPANY.industry, employees: COMPANY.employees },
      select: { id: true, name: true },
    });
  }
  console.log("✓ company:", company.name);

  const ownerUser = await ensureUser({
    email: `owner.${COMPANY.slug}@hireiq.local`,
    name: `${COMPANY.name} Owner`,
    passwordHash,
    role: "CLIENT",
  });
  await ensureMembership({
    userId: ownerUser.id,
    companyId: company.id,
    role: "OWNER",
    actorUserId: null,
  });

  const memberUser = await ensureUser({
    email: `member.${COMPANY.slug}@hireiq.local`,
    name: `${COMPANY.name} Member`,
    passwordHash,
    role: "CLIENT",
  });
  await ensureMembership({
    userId: memberUser.id,
    companyId: company.id,
    role: "MEMBER",
    actorUserId: ownerUser.id,
  });
  console.log("✓ client accounts: owner + member");

  // ── 2. Interviewers with logins ─────────────────────────────────────
  const interviewerIds: Record<string, number> = {};
  for (const iv of INTERVIEWERS) {
    await ensureUser({
      email: iv.email,
      name: iv.name,
      passwordHash,
      role: "INTERVIEWER",
    });
    interviewerIds[iv.email] = await linkInterviewerProfile(iv.email);
  }
  console.log("✓ interviewers:", Object.keys(interviewerIds).length);

  // ── 3. Two published requirements ───────────────────────────────────
  const backend = await ensureJob(company.id, ownerUser.id, {
    title: `${COMPANY.name}: Senior Backend Engineer`,
    roleCategory: "ENGINEERING",
    experienceRange: "5-9 years",
    location: "Bengaluru (Hybrid)",
    compensationRange: "₹45L – ₹65L",
    primarySkills: "Go, PostgreSQL, Kubernetes, Redis",
    mustHaveRequirements: "5+ years backend; distributed systems depth; SQL mastery",
    niceToHaveRequirements: "gRPC; event-driven architecture; prior startup experience",
    jobDescription:
      "Own Nimbus Labs' core platform services: design APIs, model data, and scale our multi-tenant infrastructure. You will work closely with product and infra to ship features end-to-end.",
    evaluationCriteria: "System design depth, coding quality, operational maturity",
    interviewerId: interviewerIds[INTERVIEWERS[0].email],
  });
  const analyst = await ensureJob(company.id, ownerUser.id, {
    title: `${COMPANY.name}: Revenue Operations Analyst`,
    roleCategory: "FINANCE",
    experienceRange: "2-5 years",
    location: "Remote (India)",
    compensationRange: "₹18L – ₹28L",
    primarySkills: "SQL, Excel modelling, Billing reconciliation",
    mustHaveRequirements: "2+ years revops/finance analytics; advanced SQL",
    niceToHaveRequirements: "SaaS billing exposure; Looker/Tableau",
    jobDescription:
      "Keep Nimbus Labs' billing engine honest: reconcile invoices, analyse revenue cohorts, and partner with engineering on billing automation.",
    evaluationCriteria: "Analytical rigour, reconciliation accuracy, communication",
    interviewerId: interviewerIds[INTERVIEWERS[1].email],
  });
  console.log("✓ published requirements:", backend.job.title.split(": ")[1], "+", analyst.job.title.split(": ")[1]);

  // Blueprint for backend rubric
  await upsertBlueprintCore(backend.specVersionId, [
    { name: "System Design", description: "Distributed systems reasoning", weight: 40 },
    { name: "Coding Depth", weight: 35 },
    { name: "Communication", weight: 25 },
  ], [
    { competencyName: "System Design", question: "Design a multi-tenant job queue with fair scheduling.", difficulty: "HARD", guidance: "Look for isolation, backpressure, and idempotency." },
    { competencyName: "Coding Depth", question: "Implement an LRU cache with TTL support.", difficulty: "MEDIUM" },
  ]);
  console.log("✓ interview blueprint attached to backend spec");

  // ── 4. Distribution + booking slots (backend role) ──────────────────
  const distribution = await ensureHostedDistribution(backend.job.id, backend.specVersionId);
  console.log("✓ hosted distribution published (apply link live)");

  const existingSlots = await prisma.interviewSlot.count({ where: { jobId: backend.job.id } });
  if (existingSlots === 0) {
    const base = new Date(Date.now() + 3 * 86400000);
    base.setUTCHours(10, 0, 0, 0);
    await prisma.interviewSlot.createMany({
      data: [0, 1, 2].map((d) => ({
        jobId: backend.job.id,
        interviewerId: interviewerIds[INTERVIEWERS[0].email],
        interviewType: InterviewType.TECHNICAL,
        startAt: new Date(base.getTime() + d * 3600000),
        durationMinutes: 60,
      })),
    });
  }
  console.log("✓ booking slots open:", await prisma.interviewSlot.count({ where: { jobId: backend.job.id, status: "OPEN" } }));

  // ── 5. Candidate A: full happy path via REAL service calls ─────────
  await candidateViaRealServices({
    token: distribution.applyToken!,
    name: "Ananya Sharma",
    email: "ananya.demo@example.com",
    resumeText: "Ananya Sharma\nStaff Engineer\nSkills: Go, Kubernetes, gRPC, Postgres\n9 years building payment platforms at scale.\n",
    integrity: { tabSwitches: 1, pastes: 0, copies: 2 },
  });

  // ── 6. Candidate B: applied, assessed mid, moved to TECH_EVALUATION ─
  await simpleCandidate({
    token: distribution.applyToken!,
    name: "Rohit Verma",
    email: "rohit.demo@example.com",
    scoreFraction: 0.6,
    pipelineStatus: ApplicationPipelineStatus.TECH_EVALUATION,
  });

  // ── 7. Candidate C: CV pool only ────────────────────────────────────
  await simpleCandidate({
    token: distribution.applyToken!,
    name: "Meera Joshi",
    email: "meera.demo@example.com",
    scoreFraction: null, // did not take assessment
    pipelineStatus: ApplicationPipelineStatus.CV_POOL,
  });

  // ── 8. Analyst role: shortlist + hire + billing ════════════════════
  const analystDistribution = await ensureHostedDistribution(analyst.job.id, analyst.specVersionId);
  await simpleCandidate({
    token: analystDistribution.applyToken!,
    name: "Devika Rao",
    email: "devika.demo@example.com",
    scoreFraction: 0.9,
    pipelineStatus: ApplicationPipelineStatus.HIRED,
    withInterviewPacket: true,
  });
  console.log("✓ analyst pipeline: shortlist → hired → billing");

  console.log("\nDemo logins (password in BOOTSTRAP_PASSWORD):");
  console.log("  admin@hireiq.local / owner.nimbus@hireiq.local / member.nimbus@hireiq.local");
  console.log("  arjun+kavya interviewer logins");
}

// ────────────────────────── helpers ──────────────────────────

async function ensureUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true },
  });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role as never,
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true },
  });
}

/**
 * User.companyId / User.interviewerId are compatibility projections that
 * the auth layer reads — fixtures must maintain them exactly like the
 * production flows do.
 */
async function linkClientCompany(userId: number, companyId: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { companyId },
  });
}

async function linkInterviewerProfile(userEmail: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: userEmail },
    select: { id: true, interviewerId: true },
  });
  if (user.interviewerId) return user.interviewerId;

  const iv = INTERVIEWERS.find((i) => i.email === userEmail);
  if (!iv) throw new Error(`No fixture interviewer for ${userEmail}`);

  const interviewer = await prisma.interviewer.upsert({
    where: { id: -1 },
    update: {},
    create: { name: iv.name, category: iv.category as never, availability: "AVAILABLE" },
  }).catch(async () => {
    const found = await prisma.interviewer.findFirst({ where: { name: iv.name } });
    if (!found) throw new Error("interviewer upsert failed");
    return found;
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { interviewerId: interviewer.id },
  });
  return interviewer.id;
}

async function ensureMembership(input: {
  userId: number;
  companyId: number;
  role: string;
  actorUserId: number | null;
}) {
  const existing = await prisma.organizationMember.findFirst({
    where: { userId: input.userId, companyId: input.companyId },
    select: { id: true },
  });
  if (!existing) {
    await prisma.organizationMember.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        role: input.role as never,
        status: "ACTIVE",
        invitedByUserId: input.actorUserId,
      },
    });
  }

  // Auth compatibility projection — always maintained, even on re-runs.
  await linkClientCompany(input.userId, input.companyId);
}

async function ensureJob(
  companyId: number,
  createdByUserId: number,
  fields: {
    title: string;
    roleCategory: string;
    experienceRange: string;
    location: string;
    compensationRange: string;
    primarySkills: string;
    mustHaveRequirements: string;
    niceToHaveRequirements: string;
    jobDescription: string;
    evaluationCriteria: string;
    interviewerId: number;
  },
) {
  const existingJob = await prisma.job.findFirst({
    where: { companyId, title: fields.title },
    select: {
      id: true,
      title: true,
      currentPublishedSpecificationVersionId: true,
    },
  });
  if (existingJob?.currentPublishedSpecificationVersionId) {
    return {
      job: existingJob as { id: number; title: string },
      specVersionId: existingJob.currentPublishedSpecificationVersionId,
    };
  }

  const created = await createPostedJobWithPublishedSpecification({
    title: fields.title,
    status: "OPEN" as never,
    companyId,
    createdByUserId,
    fields: {
      title: fields.title,
      roleCategory: fields.roleCategory as never,
      experienceRange: fields.experienceRange,
      location: fields.location,
      compensationRange: fields.compensationRange,
      targetHireDate: new Date(Date.now() + 45 * 86400000),
      numberOfPositions: 1,
      mustHaveRequirements: fields.mustHaveRequirements,
      niceToHaveRequirements: fields.niceToHaveRequirements,
      jobDescription: fields.jobDescription,
      evaluationCriteria: fields.evaluationCriteria,
      primarySkills: fields.primarySkills,
    },
    sourcingDatabaseSource: SourcingDatabaseSource.LINKEDIN,
  });

  await prisma.job.update({
    where: { id: created.id },
    data: {
      assignedInterviewerId: fields.interviewerId,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
      currentPublishedSpecificationVersionId: (
        await prisma.jobSpecificationVersion.findFirst({
          where: { jobId: created.id },
          select: { id: true },
        })
      )!.id,
    },
  });

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: created.id },
    select: { id: true, title: true, currentPublishedSpecificationVersionId: true },
  });
  return {
    job: job as { id: number; title: string },
    specVersionId: job.currentPublishedSpecificationVersionId!,
  };
}

async function ensureHostedDistribution(jobId: number, specVersionId: number) {
  const existing = await prisma.jobDistribution.findFirst({
    where: { jobId, applyUrlSnapshot: { not: null } },
    orderBy: { id: "desc" },
  });
  if (existing) {
    const raw = extractRawFromSnapshot(existing.applyUrlSnapshot!);
    return { applyToken: raw };
  }

  const minted = mintHostedApplyTokenMaterial();
  const distribution = await prisma.jobDistribution.create({
    data: {
      jobId,
      companyId: (
        await prisma.job.findUniqueOrThrow({
          where: { id: jobId },
          select: { companyId: true },
        })
      ).companyId,
      jobSpecificationVersionId: specVersionId,
      provider: "MANUAL",
      applyMode: "HIREIQ_HOSTED",
      status: "PUBLISHED",
      applyUrlSnapshot: minted.applyUrl,
    },
  });
  await prisma.applyToken.create({
    data: {
      distributionId: distribution.id,
      tokenHash: minted.tokenHash,
    },
  });
  return { applyToken: extractRawFromSnapshot(minted.applyUrl) };
}

function extractRawFromSnapshot(url: string): string {
  return url.split("/apply/")[1] ?? "";
}

/** Candidate A: everything through real exported service functions. */
async function candidateViaRealServices(input: {
  token: string;
  name: string;
  email: string;
  resumeText: string;
  integrity: { tabSwitches: number; pastes: number; copies: number };
}) {
  // 1. pre-upload resume (pending claim)
  const up = await storePendingHostedResume({
    applyTokenRaw: input.token,
    fileName: "ananya-sharma.pdf.txt",
    bytes: Buffer.from(input.resumeText, "utf8"),
  });

  // 2. submit application presenting the claim
  const submitted = await submitHostedApply({
    token: input.token,
    idempotencyKey: crypto.randomUUID(),
    body: {
      name: input.name,
      email: input.email,
      consent: true,
      coverLetter: "I build platforms that stay up.",
      location: "Bengaluru",
      experienceYears: 9,
    },
    resumeClaim: up.resumeClaim,
  });
  if (!submitted.success) throw new Error("candidate A submit failed");

  // 3. assessment invite + perfect submission WITH integrity telemetry
  const app = await applicationByEmail(input.email);
  const invite = await mintAssessmentInviteForApplication(app.id);
  const rawAssessToken = invite!.assessmentUrl.split("/assess/")[1];
  const keyRow = await prisma.assessmentInvite.findFirst({
    where: { applicationId: app.id },
    select: { scoringKey: true },
    orderBy: { id: "desc" },
  });
  const scoringKey = keyRow!.scoringKey as Record<
    string,
    { correctIndex: number; weight: number }
  >;
  const answers = Object.fromEntries(
    Object.entries(scoringKey).map(([qid, k]) => [qid, k.correctIndex]),
  );
  try {
    await submitPublicAssessment({
      token: rawAssessToken,
      answers,
      integrity: input.integrity,
    });
  } catch (error) {
    // Idempotent re-run: attempt already completed is fine.
    if (!(error instanceof Error) || !error.message.includes("already been submitted")) {
      throw error;
    }
  }

  // 4. matching + ranking runs (real engines)
  await movePipeline(app.id, ApplicationPipelineStatus.EXPERT_REVIEW);
  await executeRunCandidateMatching({
    applicationId: app.id,
    jobSpecificationVersionId: await publishedSpecForApp(app.id),
  });
  const jobId = await jobIdForApplication(app.id);
  await executeRunJobRanking({ jobId, jobSpecificationVersionId: await publishedSpecForApp(app.id) });

  // 5. evaluation + rubric scores (snapshot path)
  const interviewerId = await assignedInterviewer(jobId);
  const evaluation = await prisma.evaluation.upsert({
    where: { applicationId_interviewerId: { applicationId: app.id, interviewerId } },
    create: {
      applicationId: app.id,
      interviewerId,
      overallScore: 88,
      recommendation: Recommendation.HIRE,
      evaluatedAt: new Date(),
    },
    update: {},
  });
  await applyRubricScores(app.id, evaluation.id, [
    { competencyName: "System Design", score: 4, notes: "Strong on tenancy isolation." },
    { competencyName: "Coding Depth", score: 4 },
    { competencyName: "Communication", score: 5 },
  ]);

  await movePipeline(app.id, ApplicationPipelineStatus.TECH_EVALUATION);
  console.log("✓ candidate A (full happy path): evidence → resume doc → assessment 100% → match+rank → rubric 88");
}

/** Simple candidate: submit + optional assessment + pipeline position. */
async function simpleCandidate(input: {
  token: string;
  name: string;
  email: string;
  scoreFraction: number | null;
  pipelineStatus: ApplicationPipelineStatus;
  withInterviewPacket?: boolean;
}) {
  const submitted = await submitHostedApply({
    token: input.token,
    idempotencyKey: crypto.randomUUID(),
    body: {
      name: input.name,
      email: input.email,
      consent: true,
      experienceYears: 4,
    },
  });
  if (!submitted.success && !submitted.success) {
    // idempotent re-run: submission exists; continue
  }
  const app = await applicationByEmail(input.email);

  if (input.scoreFraction !== null) {
    const invite = await mintAssessmentInviteForApplication(app.id);
    const rawToken = invite!.assessmentUrl.split("/assess/")[1];
    const keyRow = await prisma.assessmentInvite.findFirst({
      where: { applicationId: app.id },
      select: { scoringKey: true },
      orderBy: { id: "desc" },
    });
    const scoringKey = keyRow!.scoringKey as Record<string, { correctIndex: number }>;
    const entries = Object.entries(scoringKey);
    const correctCount = Math.round(entries.length * input.scoreFraction);
    const answers = Object.fromEntries(
      entries.map(([qid, k], i) => [
        qid,
        i < correctCount ? k.correctIndex : (k.correctIndex + 1) % 4,
      ]),
    );
    try {
      await submitPublicAssessment({ token: rawToken, answers });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("already been submitted")) {
        throw error;
      }
    }
  }

  if (input.pipelineStatus !== ApplicationPipelineStatus.CV_POOL) {
    await movePipeline(app.id, input.pipelineStatus);
  }

  if (input.withInterviewPacket) {
    const interviewerId = await assignedInterviewer(await jobIdForApplication(app.id));
    await prisma.interview.create({
      data: {
        applicationId: app.id,
        type: InterviewType.TECHNICAL,
        interviewAt: new Date(Date.now() - 5 * 86400000),
        result: InterviewResult.PASSED,
      },
    });
    await prisma.codingTest.create({
      data: {
        applicationId: app.id,
        title: "Take-home: revenue cohort analysis",
        score: 82,
        maxScore: 100,
        takenAt: new Date(Date.now() - 4 * 86400000),
        status: CodingTestStatus.COMPLETED,
      },
    });
    const evaluation = await prisma.evaluation.upsert({
      where: { applicationId_interviewerId: { applicationId: app.id, interviewerId } },
      create: {
        applicationId: app.id,
        interviewerId,
        overallScore: 78,
        recommendation: Recommendation.HIRE,
        evaluatedAt: new Date(),
      },
      update: {},
    });
    void evaluation;
    await prisma.report.create({
      data: { applicationId: app.id, recommendation: Recommendation.HIRE, notes: "Panel aligned: strong analytical rigour." },
    });

    if (input.pipelineStatus === ApplicationPipelineStatus.HIRED) {
      // Requirement lifecycle must reach SOURCING_SHORTLISTING before hire
      // billing is permitted (mirrors the real client SELECT flow).
      const jobRow = await prisma.application.findUniqueOrThrow({
        where: { id: app.id },
        select: { jobId: true, companyId: true },
      });
      await prisma.job.update({
        where: { id_companyId: { id: jobRow.jobId, companyId: jobRow.companyId } },
        data: { requirementLifecycle: "SOURCING_SHORTLISTING" },
      });
      await prisma.$transaction(async (tx) => {
        const hasLine = await tx.billingLineItem.findUnique({
          where: { applicationId: app.id },
          select: { id: true },
        });
        if (!hasLine) {
          await generateBillingForHiredApplication(tx, app.id);
        }
      });
    }
  }
}

// ────────────────────────── small utilities ──────────────────────────

async function applicationByEmail(email: string) {
  // Candidates have no user account; resolve by email through the hosted
  // apply submission chain (authoritative for public applicants).
  const row = await prisma.hostedApplySubmission.findFirst({
    where: { emailNormalized: email },
    select: { id: true },
    orderBy: { id: "desc" },
  });
  if (row) {
    const event = await prisma.applicationIngestionEvent.findFirst({
      where: { hostedApplySubmissionId: row.id, applicationId: { not: null } },
      select: { applicationId: true },
      orderBy: { id: "desc" },
    });
    if (event?.applicationId) return { id: event.applicationId };
  }

  // resolve by email
  // through the hosted apply submission chain instead.
  const submission = await prisma.hostedApplySubmission.findFirst({
    where: { emailNormalized: email },
    select: { id: true },
    orderBy: { id: "desc" },
  });
  const event = await prisma.applicationIngestionEvent.findFirst({
    where: { hostedApplySubmissionId: submission?.id },
    select: { applicationId: true },
    orderBy: { id: "desc" },
  });
  if (!event?.applicationId) throw new Error(`application not resolved for ${email}`);
  return { id: event.applicationId };
}

async function movePipeline(applicationId: number, status: ApplicationPipelineStatus) {
  await prisma.application.update({ where: { id: applicationId }, data: { status } });
}

async function publishedSpecForApp(applicationId: number): Promise<number> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { job: { select: { currentPublishedSpecificationVersionId: true } } },
  });
  return app.job.currentPublishedSpecificationVersionId!;
}

async function jobIdForApplication(applicationId: number): Promise<number> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { jobId: true },
  });
  return app.jobId;
}

async function assignedInterviewer(jobId: number): Promise<number> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { assignedInterviewerId: true },
  });
  if (!job.assignedInterviewerId) throw new Error("no assigned interviewer");
  return job.assignedInterviewerId;
}

main()
  .then(async () => {
    console.log("\n✓ structural seed complete");
    await runNarrative();
    console.log("\n✓ demo world seeded");
    process.exit(0);
  })
  .catch((error) => {
    console.error("seed failed:", error.message);
    process.exit(1);
  });

// ══════════════════════════════════════════════════════════════════
// T106 NARRATIVE LAYER — turns fixture data into a believable hiring
// story with staged timestamps, rich candidate profiles, and a full
// lifecycle arc. Runs AFTER the structural seed and backdates rows.
// ══════════════════════════════════════════════════════════════════

// ────────────────────────── narrative data ──────────────────────────

const daysAgo = (n: number, hour = 10) => {
  const d = new Date(Date.now() - n * 86400000);
  d.setUTCHours(hour, 20, 0, 0);
  return d;
};

type StoryArc = {
  fixtureEmail: string;
  identity: {
    name: string;
    employer: string;
    skills: string;
    expectedCTC: string;
    linkedIn: string;
    location: string;
  };
  appliedDaysAgo: number;
  assessedDaysAgo: number | null;
  scoreFraction: number | null;
  integrity?: { tabSwitches: number; pastes: number; copies: number };
  decidedDaysAgo?: number; // evaluation / stage-decision moment
};

const STORY: StoryArc[] = [
  {
    fixtureEmail: "ananya.demo@example.com",
    identity: {
      name: "Priya Raghavan",
      employer: "Razorpay",
      skills: "Go, Kubernetes, gRPC, PostgreSQL, Redis",
      expectedCTC: "₹58L",
      linkedIn: "https://linkedin.com/in/priya-raghavan-eng",
      location: "Bengaluru",
    },
    appliedDaysAgo: 12,
    assessedDaysAgo: 9,
    scoreFraction: 1.0,
    decidedDaysAgo: 4,
  },
  {
    fixtureEmail: "rohit.demo@example.com",
    identity: {
      name: "Arjun Nair",
      employer: "Swiggy",
      skills: "Java, Kafka, Microservices, MySQL",
      expectedCTC: "₹42L",
      linkedIn: "https://linkedin.com/in/arjun-nair-backend",
      location: "Remote (Kochi)",
    },
    appliedDaysAgo: 5,
    assessedDaysAgo: 3,
    scoreFraction: 0.78,
    integrity: { tabSwitches: 3, pastes: 0, copies: 1 },
  },
  {
    fixtureEmail: "meera.demo@example.com",
    identity: {
      name: "Vikram Menon",
      employer: "Flipkart",
      skills: "Python, Django, REST APIs",
      expectedCTC: "₹30L",
      linkedIn: "https://linkedin.com/in/vikram-menon-dev",
      location: "Bengaluru",
    },
    appliedDaysAgo: 10,
    assessedDaysAgo: 8,
    scoreFraction: 0.33,
  },
];

/** Rewrite identities + backdate the story after the structural seed. */
async function runNarrative() {
  for (const arc of STORY) {
    const applied = daysAgo(arc.appliedDaysAgo);
    const submission = await prisma.hostedApplySubmission.findFirst({
      where: { emailNormalized: arc.identity.linkedIn ? undefined : undefined, OR: [{ emailNormalized: { contains: arc.fixtureEmail.split("@")[0] } }] },
      select: { id: true },
      orderBy: { id: "desc" },
    }).catch(() => null);
    void submission;

    const event = await prisma.applicationIngestionEvent.findFirst({
      where: { hostedApplySubmission: { is: { emailNormalized: { contains: arc.fixtureEmail.split("@")[0] } } } },
      select: { applicationId: true, candidateId: true, companyId: true },
      orderBy: { id: "desc" },
    });
    if (!event?.applicationId || !event.candidateId) continue;

    // Identity + richness
    await prisma.candidate.update({
      where: { id: event.candidateId },
      data: {
        name: arc.identity.name,
        currentEmployer: arc.identity.employer,
        skills: arc.identity.skills,
        expectedCTC: arc.identity.expectedCTC,
        location: arc.identity.location,
      },
    });
    const profile = await prisma.candidateProfile.findFirst({
      where: { candidateId: event.candidateId },
      select: { id: true },
    });
    if (profile) {
      await prisma.candidateProfile.update({
        where: { id: profile.id },
        data: {
          headline: `${arc.identity.skills.split(",")[0]} engineer at ${arc.identity.employer}`,
        },
      });
    }

    // Backdate the paper trail
    await prisma.hostedApplySubmission.updateMany({
      where: { emailNormalized: { contains: arc.fixtureEmail.split("@")[0] } },
      data: { createdAt: applied },
    });
    await prisma.applicationIngestionEvent.updateMany({
      where: { candidateId: event.candidateId },
      data: { createdAt: applied, processedAt: applied },
    });
    await prisma.candidate.update({
      where: { id: event.candidateId },
      data: { createdAt: applied, updatedAt: applied },
    });
    await prisma.application.updateMany({
      where: { candidateId: event.candidateId },
      data: { createdAt: applied, updatedAt: applied },
    });

    // Assessment timing
    if (arc.assessedDaysAgo !== null) {
      const attemptedAt = daysAgo(arc.assessedDaysAgo);
      await prisma.assessmentAttempt.updateMany({
        where: { invite: { applicationId: event.applicationId } },
        data: {
          startedAt: attemptedAt,
          submittedAt: attemptedAt,
          createdAt: daysAgo(arc.appliedDaysAgo),
        },
      });
    }

    // Evaluation / decision timing
    if (arc.decidedDaysAgo) {
      const decidedAt = daysAgo(arc.decidedDaysAgo);
      await prisma.evaluation.updateMany({
        where: { applicationId: event.applicationId },
        data: { evaluatedAt: decidedAt },
      });
      await prisma.interview.updateMany({
        where: { applicationId: event.applicationId },
        data: { interviewAt: daysAgo(arc.decidedDaysAgo + 1, 14) },
      });
      await prisma.codingTest.updateMany({
        where: { applicationId: event.applicationId },
        data: { takenAt: daysAgo(arc.decidedDaysAgo + 2, 16) },
      });
      await prisma.report.updateMany({
        where: { applicationId: event.applicationId },
        data: { createdAt: decidedAt, updatedAt: decidedAt },
      });
      void decidedAt;
    }
  }
  console.log("✓ narrative layer applied");
}
