import { CodingTestStatus, PracticalScoreSource } from "@prisma/client";

import { withApplicationWriteGuard } from "@/lib/privacy/erasure-guard";
import { assertEvaluationAllowed, completeStructured } from "@/lib/ai/gateway";
import { withAIRun } from "@/lib/ai/run";
import { submissionSimilarity } from "@/lib/assessments/submission-similarity";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { prisma } from "@/lib/prisma";
import { sendCandidateStageEmail, type CandidateEmailOutcome } from "@/lib/screening/candidate-email";
import {
  acceptAiCriterionSuggestion,
  finalPracticalScore,
  latestByCriterion,
  parsePracticalSubmission,
  practicalAcceptsSubmission,
  practicalStateOf,
} from "@/lib/screening/practical";
import { parseRubric, rubricMaxPoints } from "@/lib/screening/screening-policy";
import { getCurrentScreeningPolicy } from "@/lib/screening/screening-policy-service";

export class PracticalError extends Error {
  constructor(
    public readonly code: "UNAVAILABLE" | "SUBMITTED" | "OVERDUE" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "PracticalError";
  }
}

export function practicalUrl(rawToken: string) {
  const origin = getPublicAppUrl();
  return origin ? `${origin}/practical/${rawToken}` : `/practical/${rawToken}`;
}

/**
 * Assigns the job's current practical. An open assignment gets a fresh link
 * instead of a duplicate. A submitted one is only replaced on an explicit reassign.
 */
export async function assignPractical(input: {
  applicationId: number;
  companyId: number;
  actorUserId: number;
  reassign?: boolean;
}): Promise<{ codingTestId: number; url: string; reused: boolean; emailOutcome: CandidateEmailOutcome }> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, companyId: input.companyId },
    select: { id: true, jobId: true, status: true, withdrawnAt: true },
  });
  if (!application) throw new Error("Application not found.");
  if (application.withdrawnAt || application.status === "REJECTED" || application.status === "HIRED") {
    throw new Error("This application is closed.");
  }
  const policy = await getCurrentScreeningPolicy(application.jobId, input.companyId);
  if (policy.id === null || !policy.practicalTitle || policy.practicalRubric.length === 0) {
    throw new Error("Save a practical task and rubric in screening setup before assigning it.");
  }
  const now = new Date();
  const existing = await prisma.codingTest.findMany({
    where: { applicationId: application.id, inviteTokenHash: { not: null } },
    orderBy: { id: "desc" },
    select: { id: true, submittedAt: true, dueAt: true },
  });
  const open = existing.find((row) => practicalAcceptsSubmission({ submittedAt: row.submittedAt, dueAt: row.dueAt, now }));
  if (!open && existing.some((row) => row.submittedAt) && !input.reassign) {
    throw new Error("The candidate already submitted a practical. Reassign to request new work.");
  }
  const token = generateSecureToken();
  const dueAt = new Date(now.getTime() + policy.practicalDeadlineDays * 24 * 60 * 60 * 1000);
  let codingTestId: number;
  if (open) {
    await prisma.codingTest.update({ where: { id: open.id }, data: { inviteTokenHash: token.tokenHash } });
    codingTestId = open.id;
  } else {
    const created = await prisma.codingTest.create({
      data: {
        applicationId: application.id,
        title: policy.practicalTitle,
        score: 0,
        maxScore: rubricMaxPoints(policy.practicalRubric),
        status: CodingTestStatus.PENDING,
        takenAt: now,
        instructions: policy.practicalInstructions,
        allowedResources: policy.practicalAllowedResources,
        estimatedMinutes: policy.practicalEstimatedMinutes,
        compensationNote: policy.practicalCompensationNote,
        assignedAt: now,
        dueAt,
        inviteTokenHash: token.tokenHash,
        screeningPolicyId: policy.id,
      },
    });
    codingTestId = created.id;
  }
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: open ? "PRACTICAL_LINK_REISSUED" : "PRACTICAL_ASSIGNED",
    targetType: "CODING_TEST",
    targetId: codingTestId,
    reason: `policy v${policy.version}`,
  });
  const due = open?.dueAt ?? dueAt;
  const url = practicalUrl(token.rawToken);
  const emailOutcome = await sendCandidateStageEmail({
    applicationId: application.id,
    companyId: input.companyId,
    subject: (jobTitle) => `Practical task for ${jobTitle}`,
    lines: ({ name, jobTitle, companyName }) => [
      `Hi ${name},`,
      `${companyName} would like you to complete a practical task for ${jobTitle}: ${policy.practicalTitle}.`,
      policy.practicalEstimatedMinutes ? `It should take about ${policy.practicalEstimatedMinutes} minutes.` : "",
      `Submit before ${due.toUTCString()}: ${url}`,
      "The link explains the task, allowed resources, and exactly how it will be evaluated.",
    ].filter(Boolean),
  });
  return { codingTestId, url, reused: Boolean(open), emailOutcome };
}

async function practicalByToken(rawToken: string) {
  if (typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 200) return null;
  return prisma.codingTest.findUnique({
    where: { inviteTokenHash: hashSecureToken(rawToken) },
    select: {
      id: true,
      title: true,
      instructions: true,
      allowedResources: true,
      estimatedMinutes: true,
      compensationNote: true,
      dueAt: true,
      submittedAt: true,
      applicationId: true,
      application: { select: { companyId: true, withdrawnAt: true, status: true, job: { select: { title: true, company: { select: { name: true } } } } } },
      screeningPolicy: { select: { practicalRubric: true } },
    },
  });
}

/** Candidate view. The rubric is shown so expectations are clear; scores are not. */
export async function loadPracticalForCandidate(rawToken: string, now = new Date()) {
  const row = await practicalByToken(rawToken);
  if (!row) return null;
  const closed = Boolean(row.application.withdrawnAt) || row.application.status === "REJECTED" || row.application.status === "HIRED";
  return {
    title: row.title,
    jobTitle: row.application.job.title,
    companyName: row.application.job.company.name,
    instructions: row.instructions,
    allowedResources: row.allowedResources,
    estimatedMinutes: row.estimatedMinutes,
    compensationNote: row.compensationNote,
    dueAt: row.dueAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    accepting: !closed && practicalAcceptsSubmission({ submittedAt: row.submittedAt, dueAt: row.dueAt, now }),
    closed,
    rubric: parseRubric(row.screeningPolicy?.practicalRubric).map(({ label, description, maxPoints }) => ({ label, description, maxPoints })),
  };
}

export async function submitPractical(rawToken: string, body: unknown, now = new Date()) {
  const row = await practicalByToken(rawToken);
  if (!row || row.application.withdrawnAt || row.application.status === "REJECTED" || row.application.status === "HIRED") {
    throw new PracticalError("UNAVAILABLE", "This practical link is not available.");
  }
  const parsed = parsePracticalSubmission(body);
  if (!parsed.success) throw new PracticalError("INVALID", parsed.error.issues[0]?.message ?? "The submission is not valid.");
  // The link was resolved before this write. If the candidate was erased in between, nothing is stored.
  // The submission and its audit row commit together: if the row cannot be written, the submission rolls back and
  // the candidate can submit again. The actor is the candidate holding the link, so no user id is recorded.
  const guarded = await withApplicationWriteGuard(row.applicationId, async (tx) => {
    const claimed = await tx.codingTest.updateMany({
      where: {
        id: row.id,
        submittedAt: null,
        inviteTokenHash: { not: null },
        OR: [{ dueAt: null }, { dueAt: { gt: now } }],
      },
      data: {
        submittedAt: now,
        submissionText: parsed.data.text,
        submissionUrl: parsed.data.url,
        status: CodingTestStatus.IN_PROGRESS,
      },
    });
    if (claimed.count === 1) {
      await writeAuditLog(tx, {
        actorUserId: null,
        actorRole: "CANDIDATE_TOKEN",
        companyId: row.application.companyId,
        action: "PRACTICAL_SUBMITTED",
        targetType: "CODING_TEST",
        targetId: row.id,
      });
    }
    return claimed;
  });
  if (!guarded.ok) throw new PracticalError("UNAVAILABLE", "This practical link is not available.");
  const claimed = guarded.value;
  if (claimed.count !== 1) {
    if (row.submittedAt) throw new PracticalError("SUBMITTED", "This practical was already submitted.");
    throw new PracticalError("OVERDUE", "The deadline for this practical has passed. Reply to the invitation email if you need more time.");
  }
  return { submittedAt: now.toISOString() };
}

async function practicalInCompany(codingTestId: number, companyId: number) {
  const row = await prisma.codingTest.findFirst({
    where: { id: codingTestId, application: { companyId } },
    select: {
      id: true,
      applicationId: true,
      submittedAt: true,
      submissionText: true,
      submissionUrl: true,
      gradedAt: true,
      dueAt: true,
      application: { select: { companyId: true, aiEvaluationOptOut: true, humanReviewRequestedAt: true } },
      screeningPolicy: { select: { id: true, version: true, practicalRubric: true } },
      criterionScores: {
        orderBy: { createdAt: "asc" },
        select: { id: true, criterionKey: true, points: true, maxPoints: true, source: true, createdAt: true },
      },
    },
  });
  if (!row) throw new Error("Practical not found.");
  return row;
}

/**
 * Human grading. Every save appends rows; changing an existing human score
 * needs a reason. The assignment's own rubric snapshot is used, not the job's
 * current rubric, so later rubric edits never rescore old work.
 */
export async function recordPracticalScores(input: {
  codingTestId: number;
  companyId: number;
  actorUserId: number;
  scores: Array<{ criterionKey: string; points: number; rationale?: string | null }>;
}) {
  const row = await practicalInCompany(input.codingTestId, input.companyId);
  if (!row.submittedAt) throw new Error("There is no submission to grade yet.");
  const rubric = parseRubric(row.screeningPolicy?.practicalRubric);
  if (rubric.length === 0) throw new Error("This assignment has no rubric to grade against.");
  const byKey = new Map(rubric.map((criterion) => [criterion.key, criterion]));
  const previous = latestByCriterion(row.criterionScores, PracticalScoreSource.HUMAN);
  if (input.scores.length === 0) throw new Error("Enter at least one criterion score.");
  const seen = new Set<string>();
  const rows = input.scores.map((score) => {
    const criterion = byKey.get(score.criterionKey);
    if (!criterion || seen.has(score.criterionKey)) throw new Error("A score refers to an unknown or repeated criterion.");
    seen.add(score.criterionKey);
    if (!Number.isInteger(score.points) || score.points < 0 || score.points > criterion.maxPoints) {
      throw new Error(`${criterion.label}: score must be a whole number from 0 to ${criterion.maxPoints}.`);
    }
    const rationale = score.rationale?.trim().slice(0, 1000) || null;
    const prior = previous.get(score.criterionKey);
    if (prior && prior.points !== score.points && (!rationale || rationale.length < 3)) {
      throw new Error(`${criterion.label}: give a reason when changing an existing score.`);
    }
    return {
      companyId: input.companyId,
      codingTestId: row.id,
      criterionKey: criterion.key,
      points: score.points,
      maxPoints: criterion.maxPoints,
      source: PracticalScoreSource.HUMAN,
      rationale,
      gradedByUserId: input.actorUserId,
      changed: !prior || prior.points !== score.points,
      correction: Boolean(prior && prior.points !== score.points),
    };
  });
  const toInsert = rows.filter((entry) => entry.changed);
  if (toInsert.length === 0) return { complete: row.gradedAt !== null, changed: 0 };

  return prisma.$transaction(async (tx) => {
    await tx.practicalCriterionScore.createMany({
      data: toInsert.map((entry) => ({
        companyId: entry.companyId,
        codingTestId: entry.codingTestId,
        criterionKey: entry.criterionKey,
        points: entry.points,
        maxPoints: entry.maxPoints,
        source: entry.source,
        rationale: entry.rationale,
        gradedByUserId: entry.gradedByUserId,
      })),
    });
    const all = await tx.practicalCriterionScore.findMany({
      where: { codingTestId: row.id },
      select: { id: true, criterionKey: true, points: true, maxPoints: true, source: true, createdAt: true },
    });
    const final = finalPracticalScore(rubric, all);
    if (final) {
      await tx.codingTest.update({
        where: { id: row.id },
        data: { score: final.points, maxScore: final.maxPoints, status: CodingTestStatus.COMPLETED, gradedAt: new Date() },
      });
    }
    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      actorRole: "ADMIN",
      companyId: input.companyId,
      action: toInsert.some((entry) => entry.correction) ? "PRACTICAL_GRADE_CORRECTED" : "PRACTICAL_GRADED",
      targetType: "CODING_TEST",
      targetId: row.id,
      reason: toInsert.map((entry) => `${entry.criterionKey}=${entry.points}/${entry.maxPoints}`).join(", "),
    });
    return { complete: final !== null, changed: toInsert.length };
  });
}

/**
 * Optional AI draft for each criterion. Stored as AI_SUGGESTED and never
 * counted. Suggestions without a verbatim quote from the submission are
 * dropped. A provider error writes nothing and is reported to the recruiter.
 */
export async function suggestPracticalScores(input: { codingTestId: number; companyId: number; actorUserId: number }) {
  const row = await practicalInCompany(input.codingTestId, input.companyId);
  if (!row.submittedAt || !row.submissionText) throw new Error("There is no submission to review yet.");
  if (row.application.aiEvaluationOptOut || row.application.humanReviewRequestedAt) {
    throw new Error("The candidate asked for human-only review. Grade this submission yourself.");
  }
  assertEvaluationAllowed({ feature: "assessment_grade", optedOut: row.application.aiEvaluationOptOut });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI suggestions are unavailable because no AI provider is configured.");
  const rubric = parseRubric(row.screeningPolicy?.practicalRubric);
  if (rubric.length === 0) throw new Error("This assignment has no rubric.");
  const submission = row.submissionText.slice(0, 12_000);
  const system =
    "You draft rubric scores for a hiring reviewer. For each criterion give integer points from 0 to maxPoints, a quote copied verbatim from the submission that supports the score, and a one-sentence rationale. Do not infer facts that are not in the submission.";
  const user = JSON.stringify({ rubric: rubric.map(({ key, label, description, maxPoints }) => ({ key, label, description, maxPoints })), submission });
  const model = "gpt-4o-mini";
  const promptVersion = "practical-suggest-1";

  const parsed = await withAIRun(
    "assessment_grade",
    { userId: input.actorUserId },
    { companyId: input.companyId, entityType: "CodingTest", entityId: row.id, model, promptVersion, input: { system, user } },
    async () => {
      const completed = await completeStructured({
        subject: { applicationId: row.applicationId, companyId: input.companyId },
        feature: "assessment_grade",
        model,
        promptVersion,
        system,
        user,
        schemaName: "practical_suggestion",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            criteria: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  key: { type: "string" },
                  points: { type: "integer" },
                  quote: { type: "string" },
                  rationale: { type: "string" },
                },
                required: ["key", "points", "quote", "rationale"],
              },
            },
          },
          required: ["criteria"],
        },
        apiKey,
        maxRetries: 0,
      });
      return { value: completed.parsed, promptTokens: completed.promptTokens, completionTokens: completed.completionTokens, output: { kind: "practical_suggestion" } };
    },
  ).catch((error: unknown) => {
    throw new Error(`AI suggestion failed: ${error instanceof Error ? error.message : "provider error"}. No score was recorded.`);
  });

  const criteria = parsed && typeof parsed === "object" && Array.isArray((parsed as { criteria?: unknown }).criteria)
    ? ((parsed as { criteria: Array<Record<string, unknown>> }).criteria)
    : [];
  const accepted = rubric.flatMap((criterion) => {
    const suggestion = criteria.find((entry) => entry.key === criterion.key);
    if (!suggestion) return [];
    const ok = acceptAiCriterionSuggestion({ submission, criterion, points: suggestion.points, quote: suggestion.quote, rationale: suggestion.rationale });
    return ok ? [{ criterion, ...ok }] : [];
  });
  if (accepted.length > 0) {
    await prisma.practicalCriterionScore.createMany({
      data: accepted.map((entry) => ({
        companyId: input.companyId,
        codingTestId: row.id,
        criterionKey: entry.criterion.key,
        points: entry.points,
        maxPoints: entry.criterion.maxPoints,
        source: PracticalScoreSource.AI_SUGGESTED,
        rationale: entry.rationale || null,
        evidenceQuote: entry.quote,
        gradedByUserId: null,
      })),
    });
  }
  return { suggested: accepted.length, dropped: rubric.length - accepted.length };
}

export async function loadPracticalForReview(codingTestId: number, companyId: number) {
  const row = await prisma.codingTest.findFirst({
    where: { id: codingTestId, application: { companyId } },
    select: {
      id: true,
      title: true,
      applicationId: true,
      instructions: true,
      allowedResources: true,
      estimatedMinutes: true,
      assignedAt: true,
      dueAt: true,
      submittedAt: true,
      submissionText: true,
      submissionUrl: true,
      gradedAt: true,
      score: true,
      maxScore: true,
      screeningPolicy: { select: { id: true, version: true, practicalRubric: true } },
      criterionScores: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          criterionKey: true,
          points: true,
          maxPoints: true,
          source: true,
          rationale: true,
          evidenceQuote: true,
          createdAt: true,
          gradedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!row) return null;
  const rubric = parseRubric(row.screeningPolicy?.practicalRubric);
  const human = latestByCriterion(row.criterionScores, PracticalScoreSource.HUMAN);
  const ai = latestByCriterion(row.criterionScores, PracticalScoreSource.AI_SUGGESTED);
  const byId = new Map(row.criterionScores.map((score) => [score.id, score]));
  return {
    ...row,
    state: practicalStateOf({ submittedAt: row.submittedAt, gradedAt: row.gradedAt, dueAt: row.dueAt, now: new Date() }),
    rubric,
    rubricVersion: row.screeningPolicy?.version ?? null,
    criteria: rubric.map((criterion) => {
      const humanRow = human.get(criterion.key);
      const aiRow = ai.get(criterion.key);
      return {
        ...criterion,
        human: humanRow ? byId.get(humanRow.id) ?? null : null,
        suggestion: aiRow ? byId.get(aiRow.id) ?? null : null,
      };
    }),
  };
}

export const SIMILARITY_REVIEW_THRESHOLD = 0.6;
const SIMILARITY_MIN_WORDS = 40;
const SIMILARITY_COMPARE_LIMIT = 500;

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Other submissions for the same task on the same job whose wording overlaps
 * heavily. Shown to a recruiter as a reason to look, never as a finding: shared
 * starter code, task wording, and common libraries all create overlap. Nothing
 * here changes a score, a grade, or a status.
 */
export async function similarPracticalSubmissions(codingTestId: number, companyId: number) {
  const target = await prisma.codingTest.findFirst({
    where: { id: codingTestId, application: { companyId }, submittedAt: { not: null } },
    select: { id: true, title: true, submissionText: true, application: { select: { jobId: true } } },
  });
  if (!target?.submissionText || wordCount(target.submissionText) < SIMILARITY_MIN_WORDS) return [];
  const others = await prisma.codingTest.findMany({
    where: {
      id: { not: target.id },
      title: target.title,
      submittedAt: { not: null },
      screeningPolicyId: { not: null },
      application: { companyId, jobId: target.application.jobId },
    },
    orderBy: { submittedAt: "desc" },
    take: SIMILARITY_COMPARE_LIMIT,
    select: { id: true, applicationId: true, submissionText: true, application: { select: { candidate: { select: { name: true } } } } },
  });
  return others
    .filter((row) => row.submissionText && wordCount(row.submissionText) >= SIMILARITY_MIN_WORDS)
    .map((row) => ({
      codingTestId: row.id,
      applicationId: row.applicationId,
      candidateName: row.application.candidate.name,
      similarity: Math.round(submissionSimilarity(target.submissionText!, row.submissionText!) * 100) / 100,
    }))
    .filter((row) => row.similarity >= SIMILARITY_REVIEW_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}
