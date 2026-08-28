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
  Prisma,
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
  await seedPublishedInterviewerProfiles(interviewerIds);
  console.log("✓ interviewer profiles published");

  // ── 3. Two published requirements ───────────────────────────────────
  const backend = await ensureJob(company.id, ownerUser.id, {
    title: `${COMPANY.name}: Senior Backend Engineer`,
    roleCategory: "ENGINEERING",
    experienceRange: "5-9 years",
    location: "Bengaluru (Hybrid)",
    compensationRange: "₹45L – ₹65L",
    primarySkills: "Go, PostgreSQL, Kubernetes, Redis",
    mustHaveRequirements: [
      "5–9 years building backend systems in production.",
      "Strong distributed systems and SQL depth — you have operated multi-tenant services.",
      "Comfortable owning on-call, instrumentation, and operational quality.",
      "Clear written design: you can explain a trade-off without a slide deck.",
    ].join("\n"),
    niceToHaveRequirements: [
      "gRPC or event-driven architecture in production.",
      "Prior startup experience shipping with a small team.",
    ].join("\n"),
    jobDescription:
      "Nimbus Labs runs a multi-tenant hiring OS. As a backend-heavy senior engineer you design the services, APIs, and data models that keep tenant isolation honest while the product still ships weekly. You will work with product and infra — not through a ticket queue — and you will be evaluated on a skills assessment plus an expert interview, not a keyword scan.",
    evaluationCriteria: "System design depth, coding quality, operational maturity",
    interviewerId: interviewerIds[INTERVIEWERS[0].email],
    posting: {
      employmentType: "FULL_TIME",
      seniorityLevel: "SENIOR",
      responsibilities: [
        "Design and build backend services, APIs, and data models for a multi-tenant platform.",
        "Own features end-to-end: spec, implementation, rollout, and production follow-through.",
        "Keep tenant isolation, backpressure, and idempotency as first-class constraints.",
        "Review designs, raise the engineering bar, and delete work that does not earn its keep.",
        "Work directly with product and infra in Bengaluru hybrid — pairing and written specs.",
      ],
      benefits: [
        "₹45L – ₹65L CTC, scoped to the level and discussed early.",
        "Hybrid Bengaluru: in-person collaboration with remote-friendly writing.",
        "A hiring process you can see — role assessment, expert interview, written trail.",
        "High ownership on a 120-person technology team still small enough to feel.",
      ],
      aboutCompany:
        "Nimbus Labs is a 120-person technology company building hiring infrastructure. The team cares about evidence over résumé theatre: every applicant takes the same assessment and is reviewed by an independent expert before a human decision.",
    },
  });
  const analyst = await ensureJob(company.id, ownerUser.id, {
    title: `${COMPANY.name}: Revenue Operations Analyst`,
    roleCategory: "FINANCE",
    experienceRange: "2-5 years",
    location: "Remote (India)",
    compensationRange: "₹18L – ₹28L",
    primarySkills: "SQL, Excel modelling, Billing reconciliation",
    mustHaveRequirements: [
      "2–5 years in revops, finance analytics, or billing operations.",
      "Advanced SQL and comfort reconciling messy invoice-level data.",
      "You write clearly: a cohort note a founder can act on.",
    ].join("\n"),
    niceToHaveRequirements: [
      "SaaS billing exposure (usage, seats, credits).",
      "Looker or Tableau for self-serve reporting.",
    ].join("\n"),
    jobDescription:
      "Keep Nimbus Labs' billing engine honest. You reconcile invoices, analyse revenue cohorts, and sit with engineering when automation should replace a spreadsheet. This is a remote full-time analyst role: high agency, tight feedback, and a hiring process that tests the work rather than the brand on your CV.",
    evaluationCriteria: "Analytical rigour, reconciliation accuracy, communication",
    interviewerId: interviewerIds[INTERVIEWERS[1].email],
    posting: {
      employmentType: "FULL_TIME",
      seniorityLevel: "INTERMEDIATE",
      responsibilities: [
        "Reconcile invoices and credits so billed revenue matches what customers actually used.",
        "Build cohort and leakage analyses that finance and product can trust.",
        "Partner with engineering on billing automation — spec the edge cases, then verify the ship.",
        "Own the weekly revenue snapshot: what moved, why, and what to do next.",
      ],
      benefits: [
        "₹18L – ₹28L CTC.",
        "Remote (India) with overlap on IST working hours.",
        "Transparent hiring: skills assessment plus expert review.",
        "Direct line to billing and product — no four-layer reporting chain.",
      ],
      aboutCompany:
        "Nimbus Labs is a 120-person technology company. Revenue operations here is not a back-office afterthought: billing correctness is part of the product, and this role sits next to the engineers who ship it.",
    },
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

async function seedPublishedInterviewerProfiles(
  interviewerIds: Record<string, number>,
) {
  const arjunId = interviewerIds["interviewer.arjun@hireiq.local"];
  const kavyaId = interviewerIds["interviewer.kavya@hireiq.local"];
  if (arjunId) {
    await prisma.interviewerProfile.upsert({
      where: { interviewerId: arjunId },
      create: { interviewerId: arjunId, ...ARJUN_PROFILE },
      update: ARJUN_PROFILE,
    });
  }
  if (kavyaId) {
    await prisma.interviewerProfile.upsert({
      where: { interviewerId: kavyaId },
      create: { interviewerId: kavyaId, ...KAVYA_PROFILE },
      update: KAVYA_PROFILE,
    });
  }
}

const ARJUN_PROFILE = {
  headline: "Engineering interviewer — systems and backend",
  location: "Bengaluru",
  aboutText:
    "I interview backend and platform engineers for production judgement: isolation, backpressure, incident response. Fifteen years building and reviewing distributed systems. Candidates see this page before they book a slot.",
  roleTitle: "Staff Engineering Interviewer",
  experienceYears: 15,
  domains: ["Engineering"] as Prisma.InputJsonValue,
  linkedInUrl: "https://linkedin.com/in/arjun-mehta-hireiq",
  githubUrl: null,
  portfolioUrl: null,
  twitterUrl: null,
  videoUrl: null,
  leetcodeUrl: null,
  socialLinks: Prisma.JsonNull,
  experiences: [
    {
      title: "Staff Engineer",
      company: "Razorpay",
      startDate: "Apr 2020",
      endDate: "",
      isCurrent: true,
      location: "Bengaluru",
      summary:
        "Platform reliability and multi-tenant service design. Interviews senior backend hires for the same bar.",
    },
    {
      title: "Senior Engineer",
      company: "Google",
      startDate: "Aug 2014",
      endDate: "Mar 2020",
      isCurrent: false,
      location: "Bengaluru",
      summary: "Ads serving infrastructure and on-call for latency-critical paths.",
    },
  ] as Prisma.InputJsonValue,
  education: [
    {
      school: "IIT Madras",
      degree: "B.Tech",
      field: "Computer Science",
      startDate: "2008",
      endDate: "2012",
      summary: "",
    },
  ] as Prisma.InputJsonValue,
  projects: [] as Prisma.InputJsonValue,
};

const KAVYA_PROFILE = {
  headline: "Product interviewer — judgement and written clarity",
  location: "Mumbai",
  aboutText:
    "I interview PMs and analysts on problem framing, evidence, and how they write for operators. I do not score on confidence theatre.",
  roleTitle: "Product Interviewer",
  experienceYears: 11,
  domains: ["Product", "Operations"] as Prisma.InputJsonValue,
  linkedInUrl: "https://linkedin.com/in/kavya-iyer-hireiq",
  githubUrl: null,
  portfolioUrl: null,
  twitterUrl: null,
  videoUrl: null,
  leetcodeUrl: null,
  socialLinks: Prisma.JsonNull,
  experiences: [
    {
      title: "Director of Product",
      company: "CRED",
      startDate: "Jan 2021",
      endDate: "",
      isCurrent: true,
      location: "Mumbai",
      summary: "Owns collections and billing product surfaces used by operators daily.",
    },
    {
      title: "Product Lead",
      company: "Freshworks",
      startDate: "Mar 2016",
      endDate: "Dec 2020",
      isCurrent: false,
      location: "Chennai",
      summary: "Workflow products for support teams; heavy written specs.",
    },
  ] as Prisma.InputJsonValue,
  education: [
    {
      school: "ISB Hyderabad",
      degree: "PGP",
      field: "Management",
      startDate: "2014",
      endDate: "2015",
      summary: "",
    },
  ] as Prisma.InputJsonValue,
  projects: [] as Prisma.InputJsonValue,
};

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
    posting?: {
      employmentType: "FULL_TIME" | "CONTRACT" | "PART_TIME" | "INTERNSHIP";
      seniorityLevel: "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "STAFF" | "PRINCIPAL";
      responsibilities: string[];
      benefits: string[];
      aboutCompany: string;
    };
  },
) {
  const structuredPayload = fields.posting
    ? {
        schemaVersion: 2,
        employmentType: fields.posting.employmentType,
        seniorityLevel: fields.posting.seniorityLevel,
        responsibilities: fields.posting.responsibilities,
        requirements: fields.mustHaveRequirements.split("\n").map((line) => line.trim()).filter(Boolean),
        benefits: fields.posting.benefits,
        aboutCompany: fields.posting.aboutCompany,
      }
    : undefined;

  const existingJob = await prisma.job.findFirst({
    where: { companyId, title: fields.title },
    select: {
      id: true,
      title: true,
      currentPublishedSpecificationVersionId: true,
    },
  });
  if (existingJob?.currentPublishedSpecificationVersionId) {
    await prisma.job.update({
      where: { id: existingJob.id },
      data: {
        jobDescription: fields.jobDescription,
        mustHaveRequirements: fields.mustHaveRequirements,
        niceToHaveRequirements: fields.niceToHaveRequirements,
        primarySkills: fields.primarySkills,
        compensationRange: fields.compensationRange,
        location: fields.location,
        experienceRange: fields.experienceRange,
        numberOfPositions: 1,
      },
    });
    await prisma.jobSpecificationVersion.update({
      where: { id: existingJob.currentPublishedSpecificationVersionId },
      data: {
        jobDescription: fields.jobDescription,
        mustHaveRequirements: fields.mustHaveRequirements,
        niceToHaveRequirements: fields.niceToHaveRequirements,
        primarySkills: fields.primarySkills,
        compensationRange: fields.compensationRange,
        location: fields.location,
        experienceRange: fields.experienceRange,
        numberOfPositions: 1,
        ...(structuredPayload ? { structuredPayload } : {}),
      },
    });
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
    structuredPayload,
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

type StoryIdentity = {
  name: string;
  employer: string;
  skills: string;
  expectedCTC: string;
  linkedIn: string;
  location: string;
  roleTitle: string;
  headline: string;
  about: string;
  domains: string[];
  experiences: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    location: string;
    summary: string;
  }>;
  education: Array<{
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
    summary: string;
  }>;
  projects: Array<{
    name: string;
    url: string;
    technologies: string;
    summary: string;
  }>;
};

type StoryArc = {
  fixtureEmail: string;
  identity: StoryIdentity;
  appliedDaysAgo: number;
  assessedDaysAgo: number | null;
  scoreFraction: number | null;
  integrity?: { tabSwitches: number; pastes: number; copies: number };
  decidedDaysAgo?: number;
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
      roleTitle: "Staff Backend Engineer",
      headline: "Staff backend engineer at Razorpay",
      about:
        "I design payment-path services that stay correct under load. Nine years in backend systems, mostly Go and Postgres, with on-call ownership rather than architecture theatre.",
      domains: ["Engineering"],
      experiences: [
        {
          title: "Staff Engineer",
          company: "Razorpay",
          startDate: "Mar 2021",
          endDate: "",
          isCurrent: true,
          location: "Bengaluru",
          summary:
            "Owns multi-tenant ledger APIs, backpressure, and idempotency for checkout volume. Mentors senior engineers on production incidents.",
        },
        {
          title: "Senior Software Engineer",
          company: "Freshworks",
          startDate: "Jul 2017",
          endDate: "Feb 2021",
          isCurrent: false,
          location: "Chennai",
          summary:
            "Built routing and retry services for a high-throughput messaging product.",
        },
      ],
      education: [
        {
          school: "NIT Trichy",
          degree: "B.Tech",
          field: "Computer Science",
          startDate: "2013",
          endDate: "2017",
          summary: "",
        },
      ],
      projects: [
        {
          name: "Fair queue scheduler",
          url: "",
          technologies: "Go, Redis, Postgres",
          summary: "Tenant-fair job scheduling with isolation and replay.",
        },
      ],
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
      roleTitle: "Senior Backend Engineer",
      headline: "Senior backend engineer at Swiggy",
      about:
        "Event-driven backend work on order and logistics services. Strong on Kafka, weaker on Kubernetes operations — honest about that in interviews.",
      domains: ["Engineering"],
      experiences: [
        {
          title: "Senior Software Engineer",
          company: "Swiggy",
          startDate: "Jan 2022",
          endDate: "",
          isCurrent: true,
          location: "Kochi (Remote)",
          summary:
            "Delivery-promise services and consumer Kafka pipelines for live order state.",
        },
        {
          title: "Software Engineer",
          company: "Udaan",
          startDate: "Aug 2018",
          endDate: "Dec 2021",
          isCurrent: false,
          location: "Bengaluru",
          summary: "Inventory APIs and MySQL query work for B2B catalog load.",
        },
      ],
      education: [
        {
          school: "College of Engineering Trivandrum",
          degree: "B.Tech",
          field: "Electronics",
          startDate: "2014",
          endDate: "2018",
          summary: "",
        },
      ],
      projects: [],
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
      roleTitle: "Software Engineer",
      headline: "Software engineer at Flipkart",
      about:
        "Django and REST APIs for seller tools. Looking to move into stronger distributed-systems work; assessment showed the gap clearly.",
      domains: ["Engineering"],
      experiences: [
        {
          title: "Software Engineer",
          company: "Flipkart",
          startDate: "Jun 2022",
          endDate: "",
          isCurrent: true,
          location: "Bengaluru",
          summary: "Seller onboarding APIs and internal admin tools.",
        },
      ],
      education: [
        {
          school: "VIT Vellore",
          degree: "B.Tech",
          field: "Information Technology",
          startDate: "2018",
          endDate: "2022",
          summary: "",
        },
      ],
      projects: [],
    },
    appliedDaysAgo: 10,
    assessedDaysAgo: 8,
    scoreFraction: 0.33,
  },
  {
    fixtureEmail: "devika.demo@example.com",
    identity: {
      name: "Devika Rao",
      employer: "Zoho",
      skills: "SQL, Excel modelling, Billing reconciliation",
      expectedCTC: "₹24L",
      linkedIn: "https://linkedin.com/in/devika-rao-revops",
      location: "Chennai",
      roleTitle: "Revenue Operations Analyst",
      headline: "RevOps analyst — billing and cohort work",
      about:
        "Reconciles invoice-level SaaS billing and writes cohort notes a founder can act on. Hired into Nimbus Labs after a clean shortlist.",
      domains: ["Finance", "Operations"],
      experiences: [
        {
          title: "Revenue Analyst",
          company: "Zoho",
          startDate: "Feb 2023",
          endDate: "",
          isCurrent: true,
          location: "Chennai",
          summary: "Seat and usage billing reconcilation for mid-market accounts.",
        },
        {
          title: "Finance Associate",
          company: "Freshworks",
          startDate: "Jul 2021",
          endDate: "Jan 2023",
          isCurrent: false,
          location: "Chennai",
          summary: "Month-end close support and spreadsheet models for ARR.",
        },
      ],
      education: [
        {
          school: "Loyola College",
          degree: "B.Com",
          field: "Accounting",
          startDate: "2018",
          endDate: "2021",
          summary: "",
        },
      ],
      projects: [],
    },
    appliedDaysAgo: 21,
    assessedDaysAgo: 18,
    scoreFraction: 0.9,
    decidedDaysAgo: 8,
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
    const profileData = {
      headline: arc.identity.headline,
      location: arc.identity.location,
      currentEmployer: arc.identity.employer,
      skillsText: arc.identity.skills,
      expectedCTC: arc.identity.expectedCTC,
      linkedInUrl: arc.identity.linkedIn,
      roleTitle: arc.identity.roleTitle,
      aboutText: arc.identity.about,
      domains: arc.identity.domains as Prisma.InputJsonValue,
      experiences: arc.identity.experiences as Prisma.InputJsonValue,
      education: arc.identity.education as Prisma.InputJsonValue,
      projects: arc.identity.projects as Prisma.InputJsonValue,
    };
    if (profile) {
      await prisma.candidateProfile.update({
        where: { id: profile.id },
        data: profileData,
      });
    } else {
      await prisma.candidateProfile.create({
        data: {
          candidateId: event.candidateId,
          companyId: event.companyId,
          ...profileData,
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
