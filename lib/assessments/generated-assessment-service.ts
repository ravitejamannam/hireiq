import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { completeStructured } from "@/lib/ai/gateway";
import { withAIRun } from "@/lib/ai/run";
import {
  acceptQuotedGrade,
  autosaveAnswers,
  canPublish,
  drawAssessmentItems,
  generateAssessmentFromRubric,
  gradeMultipleChoice,
  parseAssessmentItems,
  rubricFromSpec,
  tokenUsable,
  type AssessmentItem,
} from "@/lib/assessments/generated-assessment";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";

export async function createDraftAssessment(jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      mustHaveRequirements: true,
      niceToHaveRequirements: true,
      currentPublishedSpecificationVersion: { select: { structuredPayload: true, mustHaveRequirements: true, niceToHaveRequirements: true } },
    },
  });
  if (!job) throw new Error("Requirement not found.");
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
    select: { version: true },
  });
  return prisma.generatedAssessment.create({
    data: {
      jobId,
      companyId: job.companyId,
      version: (latest?.version ?? 0) + 1,
      status: "DRAFT",
      items,
    },
  });
}

export async function publishAssessment(assessmentId: number, actorUserId: number) {
  const draft = await prisma.generatedAssessment.findUnique({ where: { id: assessmentId } });
  if (!draft || !canPublish(draft.status)) throw new Error("Only a draft can be published.");
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

export async function sendAssessmentLink(input: { applicationId: number; actorUserId: number }) {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { id: true, companyId: true, jobId: true, aiEvaluationOptOut: true, humanReviewRequestedAt: true },
  });
  if (!application) throw new Error("Application not found.");
  const assessment = await prisma.generatedAssessment.findFirst({
    where: { jobId: application.jobId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!assessment) throw new Error("Publish an assessment before sending it.");
  const items = parseAssessmentItems(assessment.items);
  if (!items.success) throw new Error("Published assessment is invalid.");
  const drawn = drawAssessmentItems(items.data, application.id);
  const token = generateSecureToken();
  const invite = await prisma.generatedAssessmentInvite.create({
    data: {
      applicationId: application.id,
      assessmentId: assessment.id,
      tokenHash: token.tokenHash,
      itemOrder: drawn.map((item) => item.id),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: application.companyId,
    action: "ASSESSMENT_SENT",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: application.aiEvaluationOptOut || application.humanReviewRequestedAt ? "human grading only" : null,
  });
  return { inviteId: invite.id, rawToken: token.rawToken };
}

async function inviteByRawToken(rawToken: string) {
  const tokenHash = hashSecureToken(rawToken);
  return prisma.generatedAssessmentInvite.findFirst({
    where: { OR: [{ tokenHash }, { handoffTokenHash: tokenHash }] },
    include: { assessment: true },
  });
}

export async function loadCandidateAssessment(rawToken: string, now = new Date()) {
  const invite = await inviteByRawToken(rawToken);
  if (!invite || invite.assessment.status !== "PUBLISHED") return null;
  if (!tokenUsable({ submittedAt: invite.submittedAt, expiresAt: invite.expiresAt, now })) return { closed: true as const };
  const items = parseAssessmentItems(invite.assessment.items);
  if (!items.success) return null;
  const order = Array.isArray(invite.itemOrder) ? invite.itemOrder.map(String) : items.data.map((item) => item.id);
  const byId = new Map(items.data.map((item) => [item.id, item]));
  return {
    closed: false as const,
    title: "Role assessment",
    timeLimitMinutes: invite.assessment.timeLimitMinutes,
    extraTimeRequested: invite.extraTimeRequested,
    startedAt: invite.startedAt,
    answers: (invite.answers ?? {}) as Record<string, string>,
    items: order.map((id) => byId.get(id)).filter((item): item is AssessmentItem => Boolean(item)).map((item) => ({
      id: item.id,
      type: item.type,
      prompt: item.prompt,
      choices: item.choices ?? [],
    })),
  };
}

export async function regenerateAssessmentItem(assessmentId: number, itemId: string) {
  const draft = await prisma.generatedAssessment.findUnique({ where: { id: assessmentId } });
  if (!draft || draft.status !== "DRAFT") throw new Error("Only a draft item can be regenerated.");
  const parsed = parseAssessmentItems(draft.items);
  if (!parsed.success) throw new Error("Draft items are invalid.");
  const items = parsed.data.map((item) =>
    item.id === itemId ? { ...item, prompt: `${item.prompt} Give one concrete example.` } : item,
  );
  await prisma.generatedAssessment.update({ where: { id: draft.id }, data: { items } });
}

export async function saveAssessmentProgress(rawToken: string, patch: Record<string, string>, integrity?: unknown) {
  const invite = await inviteByRawToken(rawToken);
  if (!invite || invite.submittedAt) return null;
  const answers = autosaveAnswers((invite.answers ?? {}) as Record<string, string>, patch);
  await prisma.generatedAssessmentInvite.update({
    where: { id: invite.id },
    data: { answers, integrity: integrity ?? invite.integrity ?? undefined, startedAt: invite.startedAt ?? new Date() },
  });
  return answers;
}

async function gradeWrittenAnswer(input: {
  answer: string;
  itemId: string;
  companyId: number;
  inviteId: number;
  actorUserId: number | null;
}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    const quote = input.answer.trim().slice(0, 80);
    return acceptQuotedGrade({
      answer: input.answer,
      quote: quote || null,
      score: 4,
      confidence: input.answer.trim().length >= 40 ? "high" : "low",
      optedOut: false,
      humanReview: false,
    });
  }
  const system = "Grade the answer from 1 to 5. The quote must be copied verbatim from the answer. Use low confidence when the answer does not support a score.";
  const user = JSON.stringify({ itemId: input.itemId, answer: input.answer.slice(0, 4000) });
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
        const decision = acceptQuotedGrade({
          answer: input.answer,
          quote: parsed.quote ?? null,
          score: typeof parsed.score === "number" ? parsed.score : null,
          confidence: parsed.confidence === "high" ? "high" : "low",
          optedOut: false,
          humanReview: false,
        });
        return {
          value: decision,
          promptTokens: completed.promptTokens,
          completionTokens: completed.completionTokens,
          output: { needsHuman: decision.needsHuman, score: decision.score },
        };
      },
    );
  } catch {
    return { needsHuman: true as const, score: null, quote: null, reason: "model-error" };
  }
}

export async function submitGeneratedAssessment(rawToken: string, actorUserId: number | null) {
  const invite = await inviteByRawToken(rawToken);
  if (!invite || !tokenUsable({ submittedAt: invite.submittedAt, expiresAt: invite.expiresAt, now: new Date() })) {
    throw new Error("This assessment link is closed.");
  }
  const items = parseAssessmentItems(invite.assessment.items);
  if (!items.success) throw new Error("Assessment is invalid.");
  const order = Array.isArray(invite.itemOrder) ? invite.itemOrder.map(String) : items.data.map((item) => item.id);
  const application = await prisma.application.findUnique({
    where: { id: invite.applicationId },
    select: { companyId: true, aiEvaluationOptOut: true, humanReviewRequestedAt: true },
  });
  const answers = (invite.answers ?? {}) as Record<string, string>;
  const grades = [];
  for (const item of items.data) {
    if (!order.includes(item.id)) continue;
    if (item.type === "multiple_choice") {
      const selected = Number(answers[item.id] ?? "-1");
      const graded = gradeMultipleChoice(item, selected);
      grades.push({ itemId: item.id, requirement: item.requirement, score: graded?.score ?? 0, needsHuman: false, quote: null });
      continue;
    }
    const answer = answers[item.id] ?? "";
    const humanOnly = Boolean(application?.aiEvaluationOptOut || application?.humanReviewRequestedAt);
    if (humanOnly || !application) {
      grades.push({ itemId: item.id, requirement: item.requirement, score: null, needsHuman: true, quote: null });
      continue;
    }
    const decision = await gradeWrittenAnswer({
      answer,
      itemId: item.id,
      companyId: application.companyId,
      inviteId: invite.id,
      actorUserId,
    });
    grades.push({ itemId: item.id, requirement: item.requirement, score: decision.score, needsHuman: decision.needsHuman, quote: decision.quote });
  }
  await prisma.generatedAssessmentInvite.update({
    where: { id: invite.id },
    data: { submittedAt: new Date(), grades },
  });
  const auditor = actorUserId ?? (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id;
  if (auditor && application) {
    await writeAuditLog(prisma, {
      actorUserId: auditor,
      actorRole: "ADMIN",
      companyId: application.companyId,
      action: "ASSESSMENT_SUBMITTED",
      targetType: "APPLICATION",
      targetId: invite.applicationId,
    });
  }
  return { needsHuman: grades.some((grade) => grade.needsHuman) };
}

export async function overrideAssessmentGrade(input: {
  inviteId: number;
  itemId: string;
  score: number;
  reason: string;
  actorUserId: number;
}) {
  const invite = await prisma.generatedAssessmentInvite.findUnique({
    where: { id: input.inviteId },
    include: { assessment: { select: { companyId: true } } },
  });
  if (!invite) throw new Error("Assessment not found.");
  const grades = Array.isArray(invite.grades) ? [...(invite.grades as Array<Record<string, unknown>>)] : [];
  const next = grades.map((grade) =>
    grade.itemId === input.itemId ? { ...grade, score: input.score, needsHuman: false, overrideReason: input.reason } : grade,
  );
  await prisma.generatedAssessmentInvite.update({
    where: { id: invite.id },
    data: { grades: next as unknown as object },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: invite.assessment.companyId,
    action: "ASSESSMENT_GRADE_OVERRIDDEN",
    targetType: "GENERATED_ASSESSMENT_INVITE",
    targetId: invite.id,
    reason: input.reason,
  });
}
