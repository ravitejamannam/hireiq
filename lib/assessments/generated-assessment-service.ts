import { randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";

import { runCodeSubmission } from "@/lib/assessments/code-sandbox";
import { completeStructured } from "@/lib/ai/gateway";
import { withAIRun } from "@/lib/ai/run";
import {
  SUBMIT_GRACE_MS,
  acceptQuotedGrade,
  attemptDeadline,
  autosaveAnswers,
  canPublish,
  drawUnusedAssessmentItems,
  questionSetKey,
  sanitizeIntegrity,
  generateAssessmentFromRubric,
  gradeMultipleChoice,
  parseAssessmentItems,
  rubricFromSpec,
  validateAnswerPatch,
  type AssessmentItem,
} from "@/lib/assessments/generated-assessment";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { withApplicationWriteGuard, withCandidateWriteGuard } from "@/lib/privacy/erasure-guard";
import { prisma } from "@/lib/prisma";
import { itemMaxPoints } from "@/lib/screening/basic-result";
import { sendCandidateStageEmail, type CandidateEmailOutcome } from "@/lib/screening/candidate-email";

const INVITE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type GeneratedAssessmentErrorCode = "UNAVAILABLE" | "CLOSED" | "SUBMITTED" | "INVALID" | "TIME_UP";

export class GeneratedAssessmentError extends Error {
  constructor(
    public readonly code: GeneratedAssessmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GeneratedAssessmentError";
  }
}

export type StoredItemGrade = {
  itemId: string;
  requirement: string;
  score: number | null;
  max: number;
  needsHuman: boolean;
  quote: string | null;
  reason?: string;
  overrideReason?: string;
};

async function jobInCompany(jobId: number, companyId: number) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId },
    select: {
      id: true,
      companyId: true,
      mustHaveRequirements: true,
      niceToHaveRequirements: true,
      currentPublishedSpecificationVersion: { select: { structuredPayload: true, mustHaveRequirements: true, niceToHaveRequirements: true } },
    },
  });
  if (!job) throw new Error("Requirement not found.");
  return job;
}

async function assessmentInCompany(assessmentId: number, companyId: number) {
  const assessment = await prisma.generatedAssessment.findFirst({ where: { id: assessmentId, companyId } });
  if (!assessment) throw new Error("Assessment not found.");
  return assessment;
}

export async function createDraftAssessment(jobId: number, companyId: number) {
  const job = await jobInCompany(jobId, companyId);
  const spec = job.currentPublishedSpecificationVersion;
  const source = rubricFromSpec(
    spec?.structuredPayload,
    spec?.mustHaveRequirements ?? job.mustHaveRequirements,
    spec?.niceToHaveRequirements ?? job.niceToHaveRequirements,
  );
  const items = generateAssessmentFromRubric(source);
  const latest = await prisma.generatedAssessment.findFirst({
    where: { jobId },
    orderBy: { version: "desc" },
    select: { version: true, timeLimitMinutes: true, drawCount: true, candidateInstructions: true },
  });
  return prisma.generatedAssessment.create({
    data: {
      jobId,
      companyId: job.companyId,
      version: (latest?.version ?? 0) + 1,
      status: "DRAFT",
      items,
      timeLimitMinutes: latest?.timeLimitMinutes ?? 20,
      drawCount: latest?.drawCount ?? 8,
      candidateInstructions: latest?.candidateInstructions ?? null,
    },
  });
}

export async function updateDraftAssessmentSettings(input: {
  assessmentId: number;
  companyId: number;
  timeLimitMinutes: number;
  drawCount: number;
  candidateInstructions: string | null;
}) {
  const draft = await assessmentInCompany(input.assessmentId, input.companyId);
  if (draft.status !== "DRAFT") throw new Error("Published assessments cannot be changed. Generate a new draft.");
  if (!Number.isInteger(input.timeLimitMinutes) || input.timeLimitMinutes < 5 || input.timeLimitMinutes > 240) {
    throw new Error("Time limit must be between 5 and 240 minutes.");
  }
  const parsed = parseAssessmentItems(draft.items);
  const poolSize = parsed.success ? parsed.data.length : 12;
  if (!Number.isInteger(input.drawCount) || input.drawCount < 1 || input.drawCount > poolSize) {
    throw new Error(`Questions per candidate must be between 1 and ${poolSize}.`);
  }
  const instructions = input.candidateInstructions?.trim().slice(0, 2000) || null;
  await prisma.generatedAssessment.update({
    where: { id: draft.id },
    data: { timeLimitMinutes: input.timeLimitMinutes, drawCount: input.drawCount, candidateInstructions: instructions },
  });
}

export async function publishAssessment(assessmentId: number, actorUserId: number, companyId: number) {
  const draft = await assessmentInCompany(assessmentId, companyId);
  if (!canPublish(draft.status)) throw new Error("Only a draft can be published.");
  const parsed = parseAssessmentItems(draft.items);
  if (!parsed.success) throw new Error("Fix the assessment items before publishing.");
  const published = await prisma.generatedAssessment.update({
    where: { id: draft.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), items: parsed.data },
  });
  await writeAuditLog(prisma, {
    actorUserId,
    actorRole: "ADMIN",
    companyId: draft.companyId,
    action: "ASSESSMENT_PUBLISHED",
    targetType: "GENERATED_ASSESSMENT",
    targetId: draft.id,
    reason: `version ${draft.version}`,
  });
  return published;
}

export function generatedAssessmentUrl(rawToken: string) {
  const origin = getPublicAppUrl();
  return origin ? `${origin}/assess/${rawToken}` : `/assess/${rawToken}`;
}

/**
 * Sends the latest published assessment. An open invite gets a fresh link
 * instead of a second invite, so a candidate never holds two live attempts.
 * A submitted attempt is only reopened when the recruiter asks for a retake.
 */
export async function sendAssessmentLink(input: {
  applicationId: number;
  actorUserId: number;
  companyId: number;
  retake?: boolean;
}): Promise<{ inviteId: number; rawToken: string; url: string; reused: boolean; emailOutcome: CandidateEmailOutcome; uniqueSet: boolean }> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, companyId: input.companyId },
    select: { id: true, companyId: true, jobId: true, aiEvaluationOptOut: true, humanReviewRequestedAt: true, withdrawnAt: true, status: true },
  });
  if (!application) throw new Error("Application not found.");
  if (application.withdrawnAt || application.status === "REJECTED" || application.status === "HIRED") {
    throw new Error("This application is closed.");
  }
  const assessment = await prisma.generatedAssessment.findFirst({
    where: { jobId: application.jobId, companyId: application.companyId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!assessment) throw new Error("Publish an assessment before sending it.");
  const items = parseAssessmentItems(assessment.items);
  if (!items.success) throw new Error("Published assessment is invalid.");

  const now = new Date();
  const existing = await prisma.generatedAssessmentInvite.findMany({
    where: { applicationId: application.id },
    orderBy: { id: "desc" },
    select: { id: true, assessmentId: true, submittedAt: true, expiresAt: true },
  });
  const open = existing.find((row) => !row.submittedAt && row.expiresAt.getTime() > now.getTime());
  const submittedThisVersion = existing.some((row) => row.submittedAt && row.assessmentId === assessment.id);
  if (!open && submittedThisVersion && !input.retake) {
    throw new Error("The candidate already submitted this assessment version. Send a retake to reopen it.");
  }

  const token = generateSecureToken();
  // One transaction per send. The advisory lock is per assessment version and lives in Postgres, so it
  // serialises every app instance that shares this database. The open-invite check is repeated under the
  // lock: checking only before it let concurrent sends of one application each create an invite.
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(918274, ${assessment.id}::int)`);
    const live = await tx.generatedAssessmentInvite.findFirst({
      where: { applicationId: application.id, submittedAt: null, expiresAt: { gt: now } },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (live) {
      await tx.generatedAssessmentInvite.update({ where: { id: live.id }, data: { tokenHash: token.tokenHash } });
      return { id: live.id, unique: true, reused: true };
    }
    const issued = await tx.generatedAssessmentInvite.findMany({
      where: { assessmentId: assessment.id },
      select: { itemOrder: true },
    });
    const setUses = new Map<string, number>();
    for (const row of issued) {
      const key = questionSetKey(Array.isArray(row.itemOrder) ? row.itemOrder.map(String) : []);
      setUses.set(key, (setUses.get(key) ?? 0) + 1);
    }
    const drawn = drawUnusedAssessmentItems({
      items: items.data,
      seed: randomInt(1, 2_147_483_646),
      count: assessment.drawCount,
      setUses,
    });
    const invite = await tx.generatedAssessmentInvite.create({
      data: {
        applicationId: application.id,
        assessmentId: assessment.id,
        tokenHash: token.tokenHash,
        itemOrder: drawn.items.map((item) => item.id),
        expiresAt: new Date(now.getTime() + INVITE_WINDOW_MS),
      },
      select: { id: true },
    });
    return { id: invite.id, unique: drawn.unique, reused: false };
  });
  const { unique: uniqueSet, id: inviteId, reused } = created;
  const invite = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: inviteId }, select: { expiresAt: true } });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: application.companyId,
    action: reused ? "ASSESSMENT_LINK_REISSUED" : input.retake ? "ASSESSMENT_RETAKE_SENT" : "ASSESSMENT_SENT",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: [
      application.aiEvaluationOptOut || application.humanReviewRequestedAt ? "human grading only" : `version ${assessment.version}`,
      uniqueSet ? null : "question set repeats an earlier invite; the pool has no unused set left",
    ]
      .filter(Boolean)
      .join("; "),
  });
  const url = generatedAssessmentUrl(token.rawToken);
  const emailOutcome = await sendCandidateStageEmail({
    applicationId: application.id,
    companyId: application.companyId,
    subject: (jobTitle) => `Your assessment for ${jobTitle}`,
    lines: ({ name, jobTitle, companyName }) => [
      `Hi ${name},`,
      `${companyName} invited you to a short assessment for ${jobTitle}. It takes about ${assessment.timeLimitMinutes} minutes once you start.`,
      `Open it before ${invite.expiresAt.toUTCString()}: ${url}`,
      "The first page explains what it measures, the allowed resources, and how to ask for extra time.",
    ],
  });
  return { inviteId, rawToken: token.rawToken, url, reused, emailOutcome, uniqueSet };
}

async function inviteByRawToken(rawToken: string) {
  if (typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 200) return null;
  const tokenHash = hashSecureToken(rawToken);
  return prisma.generatedAssessmentInvite.findFirst({
    where: { OR: [{ tokenHash }, { handoffTokenHash: tokenHash }] },
    include: {
      assessment: {
        select: { id: true, status: true, items: true, timeLimitMinutes: true, candidateInstructions: true, companyId: true, jobId: true },
      },
    },
  });
}

export async function isGeneratedAssessmentToken(rawToken: string) {
  return Boolean(await inviteByRawToken(rawToken));
}

function orderedItems(invite: { itemOrder: unknown }, items: AssessmentItem[]) {
  const order = Array.isArray(invite.itemOrder) ? invite.itemOrder.map(String) : items.map((item) => item.id);
  const byId = new Map(items.map((item) => [item.id, item]));
  return { order, byId, list: order.map((id) => byId.get(id)).filter((item): item is AssessmentItem => Boolean(item)) };
}

export async function loadCandidateAssessment(rawToken: string, now = new Date()) {
  const invite = await inviteByRawToken(rawToken);
  if (!invite || invite.assessment.status !== "PUBLISHED") return null;
  const job = await prisma.job.findUnique({
    where: { id: invite.assessment.jobId },
    select: { title: true, company: { select: { name: true } } },
  });
  if (invite.submittedAt) return { closed: true as const, reason: "submitted" as const };
  if (invite.expiresAt.getTime() <= now.getTime()) return { closed: true as const, reason: "expired" as const };
  const items = parseAssessmentItems(invite.assessment.items);
  if (!items.success) return null;
  const { list } = orderedItems(invite, items.data);
  const deadline = attemptDeadline({
    startedAt: invite.startedAt,
    expiresAt: invite.expiresAt,
    limitMinutes: invite.assessment.timeLimitMinutes,
    extraTime: invite.extraTimeRequested,
  });
  return {
    closed: false as const,
    title: job ? `${job.title} assessment` : "Role assessment",
    companyName: job?.company.name ?? null,
    timeLimitMinutes: invite.assessment.timeLimitMinutes,
    extraTimeRequested: invite.extraTimeRequested,
    instructions: invite.assessment.candidateInstructions,
    linkExpiresAt: invite.expiresAt.toISOString(),
    started: Boolean(invite.startedAt),
    deadline: invite.startedAt ? deadline.toISOString() : null,
    itemCount: list.length,
    measures: [...new Set(list.map((item) => item.requirement))].slice(0, 8),
    hasWrittenItems: list.some((item) => item.type !== "multiple_choice"),
    answers: invite.startedAt ? ((invite.answers ?? {}) as Record<string, string>) : {},
    items: invite.startedAt
      ? list.map((item) => ({ id: item.id, type: item.type, prompt: item.prompt, choices: item.choices ?? [], language: item.language ?? null, starter: item.starter ?? null }))
      : [],
  };
}

async function openInvite(rawToken: string, now: Date) {
  const invite = await inviteByRawToken(rawToken);
  if (!invite || invite.assessment.status !== "PUBLISHED") throw new GeneratedAssessmentError("UNAVAILABLE", "This assessment link is not valid.");
  if (invite.submittedAt) throw new GeneratedAssessmentError("SUBMITTED", "This assessment was already submitted.");
  if (invite.expiresAt.getTime() + SUBMIT_GRACE_MS <= now.getTime()) throw new GeneratedAssessmentError("CLOSED", "This assessment link has expired.");
  return invite;
}

/** Starting is explicit so the timer begins only after the candidate reads the instructions. */
export async function startGeneratedAssessment(rawToken: string, now = new Date()) {
  const invite = await openInvite(rawToken, now);
  if (invite.expiresAt.getTime() <= now.getTime()) throw new GeneratedAssessmentError("CLOSED", "This assessment link has expired.");
  await prisma.generatedAssessmentInvite.updateMany({
    where: { id: invite.id, startedAt: null, submittedAt: null },
    data: { startedAt: now },
  });
}

export async function saveAssessmentProgress(rawToken: string, patch: unknown, integrity?: unknown, now = new Date()) {
  const invite = await openInvite(rawToken, now);
  const items = parseAssessmentItems(invite.assessment.items);
  if (!items.success) throw new GeneratedAssessmentError("UNAVAILABLE", "This assessment is unavailable.");
  const { order, byId } = orderedItems(invite, items.data);
  const deadline = attemptDeadline({
    startedAt: invite.startedAt,
    expiresAt: invite.expiresAt,
    limitMinutes: invite.assessment.timeLimitMinutes,
    extraTime: invite.extraTimeRequested,
  });
  if (deadline.getTime() + SUBMIT_GRACE_MS <= now.getTime()) {
    throw new GeneratedAssessmentError("TIME_UP", "Time is up. Your saved answers will be submitted as they are.");
  }
  const checked = validateAnswerPatch({ patch, order, items: byId });
  if (!checked.ok) throw new GeneratedAssessmentError("INVALID", checked.error);
  const answers = autosaveAnswers((invite.answers ?? {}) as Record<string, string>, checked.answers);
  // The token was resolved before this write. If the candidate was erased in between, the answers are not saved.
  const guarded = await withApplicationWriteGuard(invite.applicationId, (tx) =>
    tx.generatedAssessmentInvite.updateMany({
      where: { id: invite.id, submittedAt: null },
      data: {
        answers,
        integrity: sanitizeIntegrity(integrity, order) ?? invite.integrity ?? undefined,
        startedAt: invite.startedAt ?? now,
      },
    }),
  );
  if (!guarded.ok) throw new GeneratedAssessmentError("UNAVAILABLE", "This assessment link is not valid.");
  const saved = guarded.value;
  if (saved.count !== 1) throw new GeneratedAssessmentError("SUBMITTED", "This assessment was already submitted.");
  return answers;
}

async function gradeWrittenAnswer(input: {
  answer: string;
  itemId: string;
  prompt: string;
  requirement: string;
  rubricCriterion: string;
  companyId: number;
  applicationId: number;
  inviteId: number;
  actorUserId: number | null;
}): Promise<{ needsHuman: boolean; score: number | null; quote: string | null; reason: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { needsHuman: true, score: null, quote: null, reason: "ai-unavailable" };
  }
  const system =
    "Grade the candidate's answer to the question from 1 to 5 against the stated requirement and rubric criterion. The quote must be copied verbatim from the answer. Use low confidence when the answer does not support a score.";
  const user = JSON.stringify({
    question: input.prompt,
    requirement: input.requirement,
    rubricCriterion: input.rubricCriterion,
    answer: input.answer.slice(0, 4000),
  });
  try {
    return await withAIRun(
      "assessment_grade",
      { userId: input.actorUserId },
      {
        companyId: input.companyId,
        entityType: "GeneratedAssessmentInvite",
        entityId: input.inviteId,
        model: "gpt-4o-mini",
        promptVersion: "assessment-grade-1",
        input: { system, user },
      },
      async () => {
        const completed = await completeStructured({
          subject: { applicationId: input.applicationId, companyId: input.companyId },
          feature: "assessment_grade",
          model: "gpt-4o-mini",
          promptVersion: "assessment-grade-1",
          system,
          user,
          schemaName: "assessment_grade",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              score: { type: "integer" },
              quote: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["low", "high"] },
            },
            required: ["score", "quote", "confidence"],
          },
          apiKey: key,
          maxRetries: 0,
        });
        const parsed = completed.parsed as { score?: number; quote?: string | null; confidence?: "low" | "high" };
        const inRange = typeof parsed.score === "number" && Number.isInteger(parsed.score) && parsed.score >= 1 && parsed.score <= 5;
        const decision = inRange
          ? acceptQuotedGrade({
              answer: input.answer,
              quote: parsed.quote ?? null,
              score: parsed.score ?? null,
              confidence: parsed.confidence === "high" ? "high" : "low",
              optedOut: false,
              humanReview: false,
            })
          : { needsHuman: true as const, score: null, quote: null, reason: "invalid-score" };
        return {
          value: decision,
          promptTokens: completed.promptTokens,
          completionTokens: completed.completionTokens,
          output: { needsHuman: decision.needsHuman, score: decision.score },
        };
      },
    );
  } catch {
    return { needsHuman: true, score: null, quote: null, reason: "model-error" };
  }
}

async function gradeInvite(invite: NonNullable<Awaited<ReturnType<typeof inviteByRawToken>>>, actorUserId: number | null) {
  const items = parseAssessmentItems(invite.assessment.items);
  if (!items.success) throw new Error("Assessment is invalid.");
  const { list } = orderedItems(invite, items.data);
  const application = await prisma.application.findFirst({
    where: { id: invite.applicationId, companyId: invite.assessment.companyId },
    select: { companyId: true, aiEvaluationOptOut: true, humanReviewRequestedAt: true },
  });
  if (!application) throw new Error("Application not found.");
  const answers = (invite.answers ?? {}) as Record<string, string>;
  const humanOnly = Boolean(application.aiEvaluationOptOut || application.humanReviewRequestedAt);
  const grades: StoredItemGrade[] = [];
  for (const item of list) {
    const max = itemMaxPoints(item.type);
    const base = { itemId: item.id, requirement: item.requirement, max };
    if (item.type === "multiple_choice") {
      const raw = answers[item.id];
      const graded = gradeMultipleChoice(item, raw === undefined || raw === "" ? -1 : Number(raw));
      grades.push({ ...base, score: graded?.score ?? 0, needsHuman: false, quote: null });
      continue;
    }
    if (item.type === "coding" && (item.tests?.length ?? 0) > 0) {
      const tests = item.tests ?? [];
      const result = await runCodeSubmission({ language: item.language ?? "javascript", source: answers[item.id] ?? item.starter ?? "", tests });
      const unavailable = result.runner === "unavailable" || tests.length === 0;
      grades.push({
        ...base,
        score: unavailable ? null : Math.round((result.passed / tests.length) * max),
        needsHuman: unavailable,
        quote: result.error ?? `${result.passed} of ${result.total} tests passed`,
        reason: unavailable ? "runner-unavailable" : "automated-tests",
      });
      continue;
    }
    const answer = answers[item.id] ?? "";
    // Re-read the preference before every model call: it can change while a long grading loop runs.
    const stillAllowed =
      !humanOnly &&
      (await prisma.application.count({
        where: { id: invite.applicationId, aiEvaluationOptOut: false, humanReviewRequestedAt: null },
      })) === 1;
    if (!stillAllowed) {
      grades.push({ ...base, score: null, needsHuman: true, quote: null, reason: "human-only" });
      continue;
    }
    if (!answer.trim()) {
      grades.push({ ...base, score: 0, needsHuman: false, quote: null, reason: "no-answer" });
      continue;
    }
    const decision = await gradeWrittenAnswer({
      answer,
      itemId: item.id,
      prompt: item.prompt,
      requirement: item.requirement,
      rubricCriterion: item.rubricCriterion,
      companyId: application.companyId,
      applicationId: invite.applicationId,
      inviteId: invite.id,
      actorUserId,
    });
    grades.push({ ...base, score: decision.score, needsHuman: decision.needsHuman, quote: decision.quote, reason: decision.reason });
  }
  // Erasure may run during a long grading loop. The write holds the candidate lock and is refused for an erased candidate.
  const owner = await prisma.application.findUnique({ where: { id: invite.applicationId }, select: { candidateId: true, companyId: true } });
  if (!owner) return { grades: [], companyId: application.companyId };
  const saved = await withCandidateWriteGuard(owner.candidateId, owner.companyId, (tx) =>
    tx.generatedAssessmentInvite.update({
      where: { id: invite.id },
      data: { grades: grades as unknown as object, gradedAt: new Date() },
    }),
  );
  if (!saved.ok) return { grades: [], companyId: application.companyId };
  return { grades, companyId: application.companyId };
}

/**
 * The submit is claimed atomically before grading, so a double submit gets
 * SUBMITTED instead of grading twice. If grading fails afterwards the
 * answers are kept, gradedAt stays null, and a recruiter can re-run grading.
 */
export async function submitGeneratedAssessment(rawToken: string, actorUserId: number | null, now = new Date()) {
  const invite = await openInvite(rawToken, now);
  // The claim and its audit row commit together. A candidate submitting by link is not a user, so no user id is
  // recorded; only a user who submits on a candidate's behalf is named, and then as ADMIN.
  const claimedGuard = await withApplicationWriteGuard(invite.applicationId, async (tx) => {
    const result = await tx.generatedAssessmentInvite.updateMany({
      where: { id: invite.id, submittedAt: null },
      data: { submittedAt: now, startedAt: invite.startedAt ?? now },
    });
    if (result.count === 1) {
      await writeAuditLog(tx, {
        actorUserId: actorUserId ?? null,
        actorRole: actorUserId ? "ADMIN" : "CANDIDATE_TOKEN",
        companyId: invite.assessment.companyId,
        action: "ASSESSMENT_SUBMITTED",
        targetType: "APPLICATION",
        targetId: invite.applicationId,
      });
    }
    return result;
  });
  if (!claimedGuard.ok) throw new GeneratedAssessmentError("UNAVAILABLE", "This assessment link is not valid.");
  const claimed = claimedGuard.value;
  if (claimed.count !== 1) throw new GeneratedAssessmentError("SUBMITTED", "This assessment was already submitted.");

  try {
    const { grades } = await gradeInvite({ ...invite, submittedAt: now }, actorUserId);
    return { submitted: true as const, graded: true, needsHuman: grades.some((grade) => grade.needsHuman) };
  } catch (error) {
    console.error("[generated-assessment] grading did not finish", { inviteId: invite.id, error: error instanceof Error ? error.message : "unknown" });
    return { submitted: true as const, graded: false, needsHuman: true };
  }
}

async function inviteInCompany(inviteId: number, companyId: number) {
  const invite = await prisma.generatedAssessmentInvite.findFirst({
    where: { id: inviteId, assessment: { companyId } },
    include: {
      assessment: {
        select: { id: true, status: true, items: true, timeLimitMinutes: true, candidateInstructions: true, companyId: true, jobId: true },
      },
    },
  });
  if (!invite) throw new Error("Assessment not found.");
  return invite;
}

/** Recruiter view of the latest attempt: questions, the candidate's answers, and grades with their source. */
export async function loadInviteForReview(applicationId: number, companyId: number) {
  const invite = await prisma.generatedAssessmentInvite.findFirst({
    where: { applicationId, assessment: { companyId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { assessment: { select: { id: true, version: true, items: true, timeLimitMinutes: true, companyId: true, jobId: true } } },
  });
  if (!invite) return null;
  const parsed = parseAssessmentItems(invite.assessment.items);
  const { list } = orderedItems(invite, parsed.success ? parsed.data : []);
  const answers = (invite.answers ?? {}) as Record<string, string>;
  const grades = (Array.isArray(invite.grades) ? invite.grades : []) as unknown as StoredItemGrade[];
  const gradeById = new Map(grades.map((grade) => [grade.itemId, grade]));
  return {
    id: invite.id,
    assessmentVersion: invite.assessment.version,
    startedAt: invite.startedAt,
    submittedAt: invite.submittedAt,
    gradedAt: invite.gradedAt,
    expiresAt: invite.expiresAt,
    extraTimeRequested: invite.extraTimeRequested,
    integrity: invite.integrity,
    items: list.map((item) => {
      const grade = gradeById.get(item.id) ?? null;
      const raw = answers[item.id] ?? "";
      return {
        id: item.id,
        type: item.type,
        prompt: item.prompt,
        requirement: item.requirement,
        rubricCriterion: item.rubricCriterion,
        max: itemMaxPoints(item.type),
        answer:
          item.type === "multiple_choice"
            ? raw === "" ? null : item.choices?.[Number(raw)] ?? null
            : raw || null,
        correctChoice: item.type === "multiple_choice" ? item.choices?.[item.correctIndex ?? -1] ?? null : null,
        grade,
      };
    }),
  };
}

/** Re-runs grading for a submission whose grading did not finish. */
export async function regradeGeneratedAssessment(input: { inviteId: number; companyId: number; actorUserId: number }) {
  const invite = await inviteInCompany(input.inviteId, input.companyId);
  if (!invite.submittedAt) throw new Error("This assessment has not been submitted.");
  if (invite.gradedAt) throw new Error("Grading already finished. Correct individual items instead.");
  await gradeInvite(invite, input.actorUserId);
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "ASSESSMENT_REGRADED",
    targetType: "GENERATED_ASSESSMENT_INVITE",
    targetId: invite.id,
  });
}

export async function regenerateAssessmentItem(assessmentId: number, itemId: string, companyId: number) {
  const draft = await assessmentInCompany(assessmentId, companyId);
  if (draft.status !== "DRAFT") throw new Error("Only a draft item can be regenerated.");
  const parsed = parseAssessmentItems(draft.items);
  if (!parsed.success) throw new Error("Draft items are invalid.");
  const items = parsed.data.map((item) =>
    item.id === itemId ? { ...item, prompt: `${item.prompt} Give one concrete example.` } : item,
  );
  await prisma.generatedAssessment.update({ where: { id: draft.id }, data: { items } });
}

/** Human correction of one item. The previous grade and reason stay in the audit log. */
export async function overrideAssessmentGrade(input: {
  inviteId: number;
  itemId: string;
  score: number;
  reason: string;
  actorUserId: number;
  companyId: number;
}) {
  const invite = await inviteInCompany(input.inviteId, input.companyId);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Give a reason for the correction.");
  const grades = Array.isArray(invite.grades) ? [...(invite.grades as Array<Record<string, unknown>>)] : [];
  const target = grades.find((grade) => grade.itemId === input.itemId);
  if (!target) throw new Error("That item was not graded on this submission.");
  const items = parseAssessmentItems(invite.assessment.items);
  const item = items.success ? items.data.find((row) => row.id === input.itemId) : undefined;
  const max = item ? itemMaxPoints(item.type) : typeof target.max === "number" ? target.max : 5;
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > max) throw new Error(`Score must be a whole number from 0 to ${max}.`);
  const previous = typeof target.score === "number" ? String(target.score) : "ungraded";
  const next = grades.map((grade) =>
    grade.itemId === input.itemId ? { ...grade, score: input.score, max, needsHuman: false, overrideReason: reason } : grade,
  );
  const written = await prisma.generatedAssessmentInvite.updateMany({
    where: { id: invite.id, updatedAt: invite.updatedAt },
    data: { grades: next as unknown as object, gradedAt: invite.gradedAt ?? new Date() },
  });
  if (written.count !== 1) throw new Error("These grades changed while you were editing. Reload and try again.");
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "ASSESSMENT_GRADE_OVERRIDDEN",
    targetType: "GENERATED_ASSESSMENT_INVITE",
    targetId: invite.id,
    // The reviewer's reason lives on the grade, which erasure can clear. It is not copied into the append-only log.
    reason: `${input.itemId}: ${previous} -> ${input.score} | reason recorded on the grade`,
  });
}
