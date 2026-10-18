import { ApplicationPipelineStatus, CandidateMatchResult, CandidateMatchRunStatus } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { commitApplicationStatusChange } from "@/lib/outcomes/outcome-event-writes";
import { OutcomeEventActorType } from "@prisma/client";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";
import { prisma } from "@/lib/prisma";
import {
  REVIEW_PAGE_SIZE,
  advanceStatus,
  auditReason,
  filterReviewRows,
  isReviewRejectReason,
  shortlistStatus,
  sortByScore,
  type ReviewFilters,
  type ReviewParseBadge,
  type ReviewRow,
} from "@/lib/review/review-queue";
import { assertAdminPipelineTransition } from "@/lib/validation/application-validation";

const PARSE_BADGES = new Set(["LOW_QUALITY", "OCR_DEFERRED", "OCR_EXHAUSTED"]);

function parseBadge(code: string | null, attempts: number): ReviewParseBadge {
  if (code && PARSE_BADGES.has(code)) return code as ReviewParseBadge;
  if (attempts >= 3) return "OCR_EXHAUSTED";
  return null;
}

async function companyForJob(jobId: number) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, companyId: true, title: true } });
  if (!job) throw new Error("Requirement not found.");
  return job;
}

export async function listReviewQueue(input: { jobId: number; filters: ReviewFilters; page: number }) {
  const job = await companyForJob(input.jobId);
  const applications = await prisma.application.findMany({
    where: { jobId: job.id, companyId: job.companyId },
    select: {
      id: true,
      status: true,
      aiEvaluationOptOut: true,
      humanReviewRequestedAt: true,
      rejectionReasonCode: true,
      candidate: {
        select: {
          name: true,
          role: true,
          currentEmployer: true,
          _count: { select: { intelligenceClaims: { where: { claimType: "SKILL" } } } },
        },
      },
      resumeDocuments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, fileName: true, parseErrorCode: true, ocrAttempts: true, extractedText: true },
      },
      matchRuns: {
        where: { status: CandidateMatchRunStatus.COMPLETED },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: {
          requirementMatches: {
            select: {
              result: true,
              requirementKey: true,
              claim: { select: { value: true } },
            },
          },
        },
      },
    },
    take: 500,
  });
  const questionCount = await prisma.knockoutQuestion.count({
    where: { jobId: job.id, companyId: job.companyId },
  });

  const rows: ReviewRow[] = applications.map((application) => {
    const matches = application.matchRuns[0]?.requirementMatches ?? [];
    const satisfied = matches.filter((match) => match.result === CandidateMatchResult.SATISFIED);
    const analysed = application.candidate._count.intelligenceClaims > 0;
    const score =
      application.aiEvaluationOptOut || !analysed || matches.length === 0
        ? null
        : satisfied.length / matches.length;
    const resume = application.resumeDocuments[0];
    return {
      id: application.id,
      name: application.candidate.name,
      title: application.candidate.role,
      company: application.candidate.currentEmployer,
      status: application.status,
      score,
      analysed,
      optedOut: application.aiEvaluationOptOut,
      humanReview: application.humanReviewRequestedAt !== null,
      quotes: satisfied.map((match) => match.claim?.value).filter((value): value is string => Boolean(value)).slice(0, 3),
      knockout: application.rejectionReasonCode === "KNOCKOUT" ? "fail" : questionCount === 0 ? "pass" : "unanswered",
      parseStatus: parseBadge(resume?.parseErrorCode ?? null, resume?.ocrAttempts ?? 0),
    };
  });

  const filtered = sortByScore(filterReviewRows(rows, input.filters));
  const page = Math.max(1, input.page);
  const start = (page - 1) * REVIEW_PAGE_SIZE;
  return {
    job,
    rows: filtered.slice(start, start + REVIEW_PAGE_SIZE),
    total: filtered.length,
    page,
    pageCount: Math.max(1, Math.ceil(filtered.length / REVIEW_PAGE_SIZE)),
  };
}

export async function reviewApplicationDetail(input: { applicationId: number; companyId: number }) {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, companyId: input.companyId },
    select: {
      id: true,
      status: true,
      aiEvaluationOptOut: true,
      humanReviewRequestedAt: true,
      candidate: { select: { name: true, role: true, currentEmployer: true, skills: true, location: true } },
      resumeDocuments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, fileName: true, extractedText: true },
      },
      matchRuns: {
        where: { status: CandidateMatchRunStatus.COMPLETED },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: {
          requirementMatches: {
            select: { requirementKey: true, result: true, reasonCode: true, claim: { select: { value: true } } },
          },
        },
      },
    },
  });
  if (!application) return null;
  const ingestion = await prisma.applicationIngestionEvent.findFirst({
    where: { applicationId: application.id, companyId: input.companyId },
    orderBy: { createdAt: "desc" },
    select: { hostedApplySubmission: { select: { profilePayload: true } } },
  });
  const payload = ingestion?.hostedApplySubmission?.profilePayload;
  const screeningAnswers = Array.isArray((payload as { screeningAnswers?: unknown } | null)?.screeningAnswers)
    ? ((payload as { screeningAnswers: Array<{ question: string; answer: string }> }).screeningAnswers)
    : [];
  return {
    id: application.id,
    name: application.candidate.name,
    title: application.candidate.role,
    company: application.candidate.currentEmployer,
    skills: application.candidate.skills,
    location: application.candidate.location,
    status: application.status,
    optedOut: application.aiEvaluationOptOut,
    humanReview: application.humanReviewRequestedAt !== null,
    resume: application.resumeDocuments[0] ?? null,
    requirements: application.aiEvaluationOptOut
      ? []
      : (application.matchRuns[0]?.requirementMatches ?? []).map((match) => ({
      key: match.requirementKey,
      result: match.result,
      quote:
        match.claim?.value ??
        (match.reasonCode.startsWith("FROM_PROFILE:")
          ? "from profile, not the resume"
          : match.reasonCode.startsWith("INFERRED:")
            ? `inferred from ${match.reasonCode.slice("INFERRED:".length)}`
            : null),
    })),
    screeningAnswers,
    assessmentGrades: await (async () => {
      const invite = await prisma.generatedAssessmentInvite.findFirst({
        where: { applicationId: application.id, submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        select: { grades: true },
      });
      const grades = Array.isArray(invite?.grades)
        ? (invite.grades as Array<{ requirement?: string; score?: number | null; needsHuman?: boolean; quote?: string | null }>).map((grade) => ({
            requirement: grade.requirement ?? "Item",
            score: application.aiEvaluationOptOut ? null : grade.score ?? null,
            needsHuman: application.aiEvaluationOptOut || Boolean(grade.needsHuman),
            quote: application.aiEvaluationOptOut ? null : grade.quote ?? null,
          }))
        : [];
      return grades;
    })(),
    interviewFeedback: visibleScorecards({
      viewerInterviewerId: null,
      cards: await prisma.evaluation.findMany({
        where: { applicationId: application.id },
        select: {
          interviewerId: true,
          submittedAt: true,
          overallScore: true,
          interviewer: { select: { name: true } },
        },
      }),
    }).map((card) => ({
      interviewer: card.interviewer.name,
      overallScore: card.overallScore,
    })),
  };
}

async function scoreFor(applicationId: number, companyId: number) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, companyId },
    select: {
      aiEvaluationOptOut: true,
      humanReviewRequestedAt: true,
      status: true,
      matchRuns: {
        where: { status: CandidateMatchRunStatus.COMPLETED },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: { requirementMatches: { select: { result: true } } },
      },
    },
  });
  if (!application) return null;
  const matches = application.matchRuns[0]?.requirementMatches ?? [];
  const satisfied = matches.filter((match) => match.result === CandidateMatchResult.SATISFIED).length;
  const score = application.aiEvaluationOptOut || matches.length === 0 ? null : satisfied / matches.length;
  return { ...application, score };
}

export async function applyReviewDecision(input: {
  applicationId: number;
  actorUserId: number;
  action: "advance" | "shortlist" | "reject" | "undo";
  reason?: string | null;
  undoTo?: ApplicationPipelineStatus | null;
}) {
  const owned = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { companyId: true },
  });
  if (!owned) throw new Error("Application not found.");
  const companyId = owned.companyId;
  const current = await scoreFor(input.applicationId, companyId);
  if (!current) throw new Error("Application not found.");
  if (input.action === "reject" && !isReviewRejectReason(input.reason ?? "")) {
    throw new Error("Choose a rejection reason.");
  }
  const next =
    input.action === "advance"
      ? advanceStatus(current.status)
      : input.action === "shortlist"
        ? shortlistStatus(current.status)
        : input.action === "undo"
          ? input.undoTo ?? null
          : ApplicationPipelineStatus.REJECTED;
  if (!next) throw new Error("That action is not available for this stage.");
  if (input.action !== "undo") {
    assertAdminPipelineTransition(current.status, next);
  }

  const reason = auditReason(
    input.action === "reject" ? input.reason ?? null : input.action === "undo" ? "undo" : null,
    current.score,
    current.aiEvaluationOptOut,
  );

  const updated = await prisma.$transaction(async (tx) => {
    if (input.action === "undo") {
      const changed = await tx.application.updateMany({
        where: { id: input.applicationId, companyId, status: current.status },
        data: { status: next, rejectionReason: null },
      });
      if (changed.count !== 1) throw new Error("Candidate is no longer in the expected pipeline state.");
      await writeAuditLog(tx, {
        actorUserId: input.actorUserId,
        actorRole: "ADMIN",
        companyId,
        action: "APPLICATION_REVIEW_UNDONE",
        targetType: "APPLICATION",
        targetId: input.applicationId,
        reason,
      });
      return next;
    }
    const committed = await commitApplicationStatusChange(tx, {
      applicationId: input.applicationId,
      expectedStatus: current.status,
      nextStatus: next,
      actorUserId: input.actorUserId,
      actorType: OutcomeEventActorType.ADMIN,
      actorRole: "ADMIN",
      patch: input.action === "reject" ? { rejectionReason: reason } : {},
    });
    if (!committed) throw new Error("Candidate is no longer in the expected pipeline state.");
    return next;
  });
  return { status: updated, previous: current.status };
}
