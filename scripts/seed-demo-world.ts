/**
 * Client-demo seed — a full hiring world, not a thin fixture.
 *
 * 8 companies × 6 live openings × 8 pipeline seats, plus Nimbus as the
 * deep path (resume claim, assessment integrity, matching, ranking, rubric).
 *
 * Built through real service functions wherever the codebase allows.
 * Idempotent: safe to re-run; existing rows are skipped.
 *
 * Usage: pnpm db:bootstrap-dev   (BOOTSTRAP_PASSWORD or ADMIN_PASSWORD)
 */

import "dotenv/config";

import { createHash, randomBytes } from "crypto";

import {
  ApplicationIngestionChannel,
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
import { mintAssessmentInviteForApplication, submitPublicAssessment, upsertAssessmentBank } from "../lib/assessments/assessment-service";
import { snapshotAssessmentQuestionIds } from "../lib/assessments/assessment-snapshot";
import { upsertBlueprintCore, applyRubricScores } from "../lib/interviews/blueprint-service";
import { executeRunCandidateMatching } from "../lib/candidates/matching/matching-service";
import { executeRunJobRanking } from "../lib/candidates/ranking/ranking-service";
import { createPostedJobWithPublishedSpecification } from "../lib/jobs/job-specification";
import { mintHostedApplyTokenMaterial, rewriteHostedApplySnapshotsToPublicOrigin } from "../lib/apply/apply-token";
import { generateBillingForHiredApplication } from "../lib/billing/generate-hire-billing";
import { shortlistedAtPatch } from "../lib/hiring/pipeline-timestamps";
import { prisma } from "../lib/prisma";
import {
  UserValidationError,
  validateBootstrapPassword,
} from "../lib/validation/user-validation";
import {
  DEMO_COMPANIES,
  DEMO_INTERVIEWERS,
  PIPELINE_PACK,
  demoApplicant,
  rolesForCompany,
  type CompanyDef,
  type InterviewerDef,
  type PipelineSeat,
  type RoleSpec,
} from "./demo-world/catalog";

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

  await upsertAssessmentBank(prisma);
  console.log("✓ assessment bank");

  const interviewerIds: Record<string, number> = {};
  for (const iv of DEMO_INTERVIEWERS) {
    await ensureUser({
      email: iv.email,
      name: iv.name,
      passwordHash,
      role: "INTERVIEWER",
    });
    interviewerIds[iv.email] = await linkInterviewerProfile(iv.email);
  }
  console.log("✓ interviewers:", DEMO_INTERVIEWERS.length);
  await seedPublishedInterviewerProfiles(interviewerIds);
  console.log("✓ interviewer profiles published");

  for (let companyIndex = 0; companyIndex < DEMO_COMPANIES.length; companyIndex += 1) {
    const def = DEMO_COMPANIES[companyIndex]!;
    const company = await ensureCompany(def);
    const ownerUser = await ensureUser({
      email: `owner.${def.slug}@hireiq.local`,
      name: `${def.name} Owner`,
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
      email: `member.${def.slug}@hireiq.local`,
      name: `${def.name} Member`,
      passwordHash,
      role: "CLIENT",
    });
    await ensureMembership({
      userId: memberUser.id,
      companyId: company.id,
      role: "MEMBER",
      actorUserId: ownerUser.id,
    });

    const roles = rolesForCompany(def);
    for (let jobIndex = 0; jobIndex < roles.length; jobIndex += 1) {
      const role = roles[jobIndex]!;
      const interviewer = DEMO_INTERVIEWERS[jobIndex % DEMO_INTERVIEWERS.length]!;
      const interviewerId = interviewerIds[interviewer.email]!;
      const posted = await ensureJob(company.id, ownerUser.id, roleToJobFields(role, interviewerId));
      const distribution = await ensureHostedDistribution(posted.job.id, posted.specVersionId);
      await ensureSlots(posted.job.id, interviewerId, companyIndex, jobIndex);

      if (def.slug === "nimbus" && role.key === "backend") {
        await upsertBlueprintCore(
          posted.specVersionId,
          [
            { name: "System Design", description: "Distributed systems reasoning", weight: 40 },
            { name: "Coding Depth", weight: 35 },
            { name: "Communication", weight: 25 },
          ],
          [
            {
              competencyName: "System Design",
              question: "Design a multi-tenant job queue with fair scheduling.",
              difficulty: "HARD",
              guidance: "Look for isolation, backpressure, and idempotency.",
            },
            {
              competencyName: "Coding Depth",
              question: "Implement an LRU cache with TTL support.",
              difficulty: "MEDIUM",
            },
          ],
        );
        if (!(await hostedApplyExists("ananya.demo@example.com"))) {
          await candidateViaRealServices({
            token: distribution.applyToken!,
            name: "Ananya Sharma",
            email: "ananya.demo@example.com",
            resumeText:
              "Ananya Sharma\nStaff Engineer\nSkills: Go, Kubernetes, gRPC, Postgres\n9 years building payment platforms at scale.\n",
            integrity: { tabSwitches: 1, pastes: 0, copies: 2 },
          });
        }
        await simpleCandidate({
          token: distribution.applyToken!,
          name: "Rohit Verma",
          email: "rohit.demo@example.com",
          scoreFraction: 0.6,
          pipelineStatus: ApplicationPipelineStatus.TECH_EVALUATION,
        });
        await simpleCandidate({
          token: distribution.applyToken!,
          name: "Meera Joshi",
          email: "meera.demo@example.com",
          scoreFraction: null,
          pipelineStatus: ApplicationPipelineStatus.CV_POOL,
        });
      }

      if (def.slug === "nimbus" && role.key === "finance") {
        await simpleCandidate({
          token: distribution.applyToken!,
          name: "Devika Rao",
          email: "devika.demo@example.com",
          scoreFraction: 0.9,
          pipelineStatus: ApplicationPipelineStatus.HIRED,
          withInterviewPacket: true,
        });
      }

      await seedPipelineRoster({
        token: distribution.applyToken!,
        slug: def.slug,
        jobKey: role.key,
        city: def.city,
        compensation: role.compensationRange,
      });
      console.log(`  · ${def.slug}/${role.key}`);
    }
    console.log(`✓ ${def.name}: 6 openings, pipeline seats filled`);
  }

  const rewritten = await rewriteHostedApplySnapshotsToPublicOrigin(prisma);
  if (rewritten > 0) {
    console.log(`✓ apply snapshots rewritten to current APP_URL (${rewritten})`);
  }

  const [companies, jobs, applications, interviewers] = await Promise.all([
    prisma.company.count(),
    prisma.job.count({ where: { status: "OPEN" } }),
    prisma.application.count(),
    prisma.interviewer.count(),
  ]);
  console.log(
    `\nDemo world: ${companies} companies, ${jobs} open roles, ${applications} applications, ${interviewers} interviewers`,
  );
  console.log("\nDemo logins (password in BOOTSTRAP_PASSWORD / ADMIN_PASSWORD):");
  console.log("  Admin        admin@hireiq.local");
  console.log("  Client       owner.nimbus@hireiq.local  (also owner.{slug}@hireiq.local)");
  console.log("  Interviewer  interviewer.arjun@hireiq.local");
  console.log("  Careers      /careers  and  /careers/nimbus");
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

  const iv = DEMO_INTERVIEWERS.find((i) => i.email === userEmail);
  if (!iv) throw new Error(`No fixture interviewer for ${userEmail}`);

  let interviewer = await prisma.interviewer.findFirst({
    where: { name: iv.name },
  });
  if (!interviewer) {
    interviewer = await prisma.interviewer.create({
      data: {
        name: iv.name,
        category: iv.category as never,
        availability: "AVAILABLE",
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { interviewerId: interviewer.id },
  });
  return interviewer.id;
}

async function seedPublishedInterviewerProfiles(
  interviewerIds: Record<string, number>,
) {
  for (const iv of DEMO_INTERVIEWERS) {
    const interviewerId = interviewerIds[iv.email];
    if (!interviewerId) continue;
    const profile = interviewerProfileData(iv);
    await prisma.interviewerProfile.upsert({
      where: { interviewerId },
      create: { interviewerId, ...profile },
      update: profile,
    });
  }
}

function interviewerProfileData(iv: InterviewerDef) {
  const slug = iv.name.toLowerCase().replace(/\s+/g, "-");
  return {
    headline: iv.headline,
    location: iv.location,
    aboutText: iv.aboutText,
    roleTitle: iv.roleTitle,
    experienceYears: iv.experienceYears,
    domains: iv.domains as Prisma.InputJsonValue,
    linkedInUrl: `https://linkedin.com/in/${slug}-hireiq`,
    githubUrl: null,
    portfolioUrl: null,
    twitterUrl: null,
    videoUrl: null,
    leetcodeUrl: null,
    socialLinks: Prisma.JsonNull,
    experiences: [
      {
        title: iv.currentTitle,
        company: iv.currentCompany,
        startDate: "Jan 2021",
        endDate: "",
        isCurrent: true,
        location: iv.location,
        summary: iv.aboutText.split(".")[0] + ".",
      },
      {
        title: iv.priorTitle,
        company: iv.priorCompany,
        startDate: "Mar 2016",
        endDate: "Dec 2020",
        isCurrent: false,
        location: iv.location,
        summary: `Prior work at ${iv.priorCompany}.`,
      },
    ] as Prisma.InputJsonValue,
    education: [
      {
        school: iv.school,
        degree: iv.degree,
        field: iv.field,
        startDate: "2008",
        endDate: "2012",
        summary: "",
      },
    ] as Prisma.InputJsonValue,
    projects: [] as Prisma.InputJsonValue,
  };
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
    numberOfPositions?: number;
    interviewRoundPlan?: InterviewType[];
    posting?: {
      employmentType: "FULL_TIME" | "CONTRACT" | "PART_TIME" | "INTERNSHIP";
      seniorityLevel: "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "STAFF" | "PRINCIPAL";
      responsibilities: string[];
      benefits: string[];
      aboutCompany: string;
    };
  },
) {
  const positions = fields.numberOfPositions ?? 1;
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
        numberOfPositions: positions,
        assignedInterviewerId: fields.interviewerId,
        ...(fields.interviewRoundPlan
          ? { interviewRoundPlan: fields.interviewRoundPlan }
          : {}),
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
        numberOfPositions: positions,
        ...(structuredPayload ? { structuredPayload } : {}),
      },
    });
    const publishedSpec = await prisma.jobSpecificationVersion.findUnique({
      where: { id: existingJob.currentPublishedSpecificationVersionId },
      select: { assessmentQuestionIds: true, roleCategory: true },
    });
    if (
      publishedSpec &&
      publishedSpec.assessmentQuestionIds.length === 0 &&
      publishedSpec.roleCategory
    ) {
      await prisma.jobSpecificationVersion.update({
        where: { id: existingJob.currentPublishedSpecificationVersionId },
        data: {
          assessmentQuestionIds: await snapshotAssessmentQuestionIds(
            publishedSpec.roleCategory,
            prisma,
          ),
        },
      });
    }
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
      numberOfPositions: positions,
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
      ...(fields.interviewRoundPlan
        ? { interviewRoundPlan: fields.interviewRoundPlan }
        : {}),
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
  location?: string;
}) {
  if (await hostedApplyExists(input.email)) {
    return;
  }
  const submitted = await submitHostedApply({
    token: input.token,
    idempotencyKey: crypto.randomUUID(),
    body: {
      name: input.name,
      email: input.email,
      consent: true,
      experienceYears: 4,
      location: input.location ?? "India",
    },
  });
  if (!submitted.success) {
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
      await billHiredApplication(app.id);
    }
  }
}

// ────────────────────────── small utilities ──────────────────────────

async function applicationByEmail(email: string) {
  const emailNormalized = email.trim().toLowerCase();
  const row = await prisma.hostedApplySubmission.findFirst({
    where: { emailNormalized },
    select: { id: true },
    orderBy: { id: "desc" },
  });
  if (!row) throw new Error(`application not resolved for ${email}`);
  const event = await prisma.applicationIngestionEvent.findFirst({
    where: { hostedApplySubmissionId: row.id, applicationId: { not: null } },
    select: { applicationId: true },
    orderBy: { id: "desc" },
  });
  if (!event?.applicationId) throw new Error(`application not resolved for ${email}`);
  return { id: event.applicationId };
}

async function movePipeline(applicationId: number, status: ApplicationPipelineStatus) {
  const existing = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { shortlistedAt: true },
  });
  const shortlistStamp =
    (status === ApplicationPipelineStatus.SHORTLISTED ||
      status === ApplicationPipelineStatus.SELECTED ||
      status === ApplicationPipelineStatus.HIRED) &&
    !existing?.shortlistedAt
      ? { shortlistedAt: new Date() }
      : shortlistedAtPatch(status, existing?.shortlistedAt);
  await prisma.application.update({
    where: { id: applicationId },
    data: { status, ...shortlistStamp },
  });
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

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function hostedApplyExists(email: string) {
  const row = await prisma.hostedApplySubmission.findFirst({
    where: { emailNormalized: email.trim().toLowerCase() },
    select: { id: true },
  });
  return Boolean(row);
}

async function ensureCompany(def: CompanyDef) {
  const data = {
    name: def.name,
    industry: def.industry,
    employees: def.employees,
    publicSlug: def.slug,
    publishApplicationCount: def.publishApplicationCount,
    agencyMarkupBps: def.agencyMarkupBps,
  };
  const bySlug = await prisma.company.findUnique({
    where: { publicSlug: def.slug },
    select: { id: true, name: true, publicSlug: true },
  });
  if (bySlug) {
    return prisma.company.update({
      where: { id: bySlug.id },
      data: {
        name: def.name,
        industry: def.industry,
        employees: def.employees,
        publishApplicationCount: def.publishApplicationCount,
        agencyMarkupBps: def.agencyMarkupBps,
      },
      select: { id: true, name: true, publicSlug: true },
    });
  }
  const byName = await prisma.company.findFirst({
    where: { name: def.name },
    select: { id: true, publicSlug: true },
  });
  if (byName) {
    const taken = await prisma.company.findUnique({
      where: { publicSlug: def.slug },
      select: { id: true },
    });
    return prisma.company.update({
      where: { id: byName.id },
      data: {
        ...data,
        publicSlug: !taken || taken.id === byName.id ? def.slug : byName.publicSlug,
      },
      select: { id: true, name: true, publicSlug: true },
    });
  }
  return prisma.company.create({
    data,
    select: { id: true, name: true, publicSlug: true },
  });
}

function roleToJobFields(role: RoleSpec, interviewerId: number) {
  return {
    title: role.title,
    roleCategory: role.roleCategory,
    experienceRange: role.experienceRange,
    location: role.location,
    compensationRange: role.compensationRange,
    primarySkills: role.primarySkills,
    mustHaveRequirements: role.mustHaveRequirements,
    niceToHaveRequirements: role.niceToHaveRequirements,
    jobDescription: role.jobDescription,
    evaluationCriteria: role.evaluationCriteria,
    interviewerId,
    numberOfPositions: role.numberOfPositions,
    interviewRoundPlan: role.interviewRoundPlan as InterviewType[],
    posting: {
      employmentType: role.employmentType,
      seniorityLevel: role.seniorityLevel,
      responsibilities: role.responsibilities,
      benefits: role.benefits,
      aboutCompany: role.aboutCompany,
    },
  };
}

async function ensureSlots(
  jobId: number,
  interviewerId: number,
  companyIndex: number,
  jobIndex: number,
) {
  const existing = await prisma.interviewSlot.count({ where: { jobId } });
  if (existing > 0) return;
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 5);
  base.setUTCHours(9, 0, 0, 0);
  const offsetMs = (companyIndex * 6 + jobIndex) * 3600000;
  try {
    await prisma.interviewSlot.createMany({
      data: [0, 1, 2].map((slot) => ({
        jobId,
        interviewerId,
        interviewType: InterviewType.TECHNICAL,
        startAt: new Date(base.getTime() + offsetMs + slot * 90 * 60000),
        durationMinutes: 60,
      })),
    });
  } catch {
    // Unique (interviewerId, startAt) can collide on a dense re-run; skip.
  }
}

async function seedPipelineRoster(input: {
  token: string;
  slug: string;
  jobKey: string;
  city: string;
  compensation: string;
}) {
  for (let i = 0; i < PIPELINE_PACK.length; i += 1) {
    const seat = PIPELINE_PACK[i]!;
    const person = demoApplicant({
      slug: input.slug,
      jobKey: input.jobKey,
      seatIndex: i,
      city: input.city,
    });
    const already = await hostedApplyExists(person.email);
    await simpleCandidate({
      token: input.token,
      name: person.name,
      email: person.email,
      scoreFraction: seat.scoreFraction,
      pipelineStatus: seat.status as ApplicationPipelineStatus,
      location: person.location,
    });
    if (already) continue;
    const app = await applicationByEmail(person.email);
    await stampSource(app.id, seat.source);
    await attachSeatArtifacts(app.id, seat, input.compensation);
  }
}

async function stampSource(applicationId: number, source: PipelineSeat["source"]) {
  await prisma.applicationIngestionEvent.updateMany({
    where: { applicationId },
    data: { sourceChannel: source as ApplicationIngestionChannel },
  });
}

async function attachSeatArtifacts(
  applicationId: number,
  seat: PipelineSeat,
  compensation: string,
) {
  const existingInterviews = await prisma.interview.count({
    where: { applicationId },
  });
  if (existingInterviews === 0 && seat.interviews.length > 0) {
    const result =
      seat.interviewResult === "PASSED"
        ? InterviewResult.PASSED
        : seat.interviewResult === "FAILED"
          ? InterviewResult.FAILED
          : InterviewResult.PENDING;
    await prisma.interview.createMany({
      data: seat.interviews.map((type, index) => ({
        applicationId,
        type: type as InterviewType,
        interviewAt: new Date(Date.now() - (6 - index) * 86400000),
        result,
      })),
    });
  }

  if (seat.offer !== "none") {
    await stampOffer(applicationId, seat.offer, compensation);
  }

  if (seat.status === "SELECTED" || seat.status === "HIRED" || seat.offer === "declined") {
    const interviewerId = await assignedInterviewer(
      await jobIdForApplication(applicationId),
    );
    await prisma.evaluation.upsert({
      where: {
        applicationId_interviewerId: { applicationId, interviewerId },
      },
      create: {
        applicationId,
        interviewerId,
        overallScore: seat.status === "HIRED" ? 88 : 74,
        recommendation:
          seat.status === "REJECTED" ? Recommendation.NO_HIRE : Recommendation.HIRE,
        evaluatedAt: new Date(),
      },
      update: {},
    });
    const reports = await prisma.report.count({ where: { applicationId } });
    if (reports === 0) {
      await prisma.report.create({
        data: {
          applicationId,
          recommendation:
            seat.status === "REJECTED" ? Recommendation.NO_HIRE : Recommendation.HIRE,
          notes:
            seat.offer === "declined"
              ? "Panel recommended hire; candidate declined the offer."
              : "Panel aligned on evidence from assessment and interview.",
        },
      });
    }
    const tests = await prisma.codingTest.count({ where: { applicationId } });
    if (tests === 0 && (seat.status === "HIRED" || seat.status === "SELECTED")) {
      await prisma.codingTest.create({
        data: {
          applicationId,
          title: "Take-home work sample",
          score: seat.status === "HIRED" ? 90 : 78,
          maxScore: 100,
          takenAt: new Date(Date.now() - 4 * 86400000),
          status: CodingTestStatus.COMPLETED,
        },
      });
    }
  }

  if (seat.bill) {
    await billHiredApplication(applicationId);
  }
}

async function stampOffer(
  applicationId: number,
  kind: "minted" | "accepted" | "declined",
  compensation: string,
) {
  const existing = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { offerMintedAt: true },
  });
  if (existing?.offerMintedAt) return;
  const now = new Date();
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      offerAcceptanceTokenHash: sha256Hex(`offer_${randomBytes(24).toString("hex")}`),
      offerMintedAt: now,
      offerTerms:
        kind === "declined"
          ? "Standard full-time terms. Candidate declined."
          : "Full-time employment. Probation 3 months. Notice 60 days. Benefits as discussed in the offer conversation.",
      offerCompensation: compensation,
      proposedStartDate: new Date(now.getTime() + 21 * 86400000),
      offerAcceptedAt: kind === "accepted" ? now : null,
      offerDeclinedAt: kind === "declined" ? now : null,
    },
  });
}

async function billHiredApplication(applicationId: number) {
  const jobRow = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      jobId: true,
      companyId: true,
      job: { select: { requirementLifecycle: true } },
    },
  });
  if (
    jobRow.job.requirementLifecycle === "REQUIREMENT_POSTED" ||
    jobRow.job.requirementLifecycle === "INTERVIEWER_NOTIFIED"
  ) {
    await prisma.job.update({
      where: { id_companyId: { id: jobRow.jobId, companyId: jobRow.companyId } },
      data: { requirementLifecycle: "SOURCING_SHORTLISTING" },
    });
  }
  await prisma.$transaction(async (tx) => {
    const hasLine = await tx.billingLineItem.findUnique({
      where: { applicationId },
      select: { id: true },
    });
    if (!hasLine) {
      await generateBillingForHiredApplication(tx, applicationId);
    }
  });
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
