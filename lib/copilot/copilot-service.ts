import { RateLimitError, consumeAuthRateLimit, rateLimitKeyForUser } from "@/lib/auth/rate-limit";
import { withAIRun } from "@/lib/ai/run";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";
import { prisma } from "@/lib/prisma";
import { applyReviewDecision } from "@/lib/review/review-queue-service";
import { loadTalentRediscovery } from "@/lib/talent/rediscovery-service";
import {
  COPILOT_HISTORY_DAYS,
  answerWithCitations,
  draftMessage,
  formatCandidateSearch,
  manualReviewListing,
  pastCandidateHint,
  requirementMatchesSkill,
  protectedQuestion,
  refusalForProtectedQuestion,
  copilotActorFromUser,
  copilotJobAllowed,
  type CopilotAction,
  type CopilotCitation,
} from "@/lib/copilot/policy";

export type CopilotActor = ReturnType<typeof copilotActorFromUser>;
export { copilotActorFromUser, copilotJobAllowed };

async function assertJobAccess(actor: CopilotActor, jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, companyId: true, title: true, assignedInterviewerId: true },
  });
  if (!job || !copilotJobAllowed({ actor, jobCompanyId: job.companyId, assignedInterviewerId: job.assignedInterviewerId })) {
    throw new Error("You cannot access this job.");
  }
  return job;
}

function coverage(matches: Array<{ result: string }>) {
  if (matches.length === 0) return null;
  return matches.filter((match) => match.result === "SATISFIED").length / matches.length;
}

export async function searchCandidates(input: { actor: CopilotActor; jobId: number; skill: string }) {
  const job = await assertJobAccess(input.actor, input.jobId);
  const needle = input.skill.trim().toLowerCase();
  const applications = await prisma.application.findMany({
    where: { jobId: job.id, companyId: job.companyId },
    include: {
      candidate: { select: { name: true } },
      matchRuns: { orderBy: { id: "desc" }, take: 1, include: { requirementMatches: { include: { claim: { select: { value: true } } } } } },
    },
  });
  const ranked = [];
  const manual = [];
  const corpus: string[] = [];
  for (const application of applications) {
    const matches = application.matchRuns[0]?.requirementMatches ?? [];
    const hit = matches.find((match) => `${match.requirementKey} ${match.claim?.value ?? ""}`.toLowerCase().includes(needle));
    if (application.aiEvaluationOptOut) {
      if (hit) manual.push(manualReviewListing(application.candidate.name));
      continue;
    }
    const quote = hit?.claim?.value;
    if (!quote) continue;
    corpus.push(quote);
    ranked.push({
      applicationId: application.id,
      name: application.candidate.name,
      coverage: coverage(matches),
      quote,
      href: `/dashboard/jobs/${job.id}/review?selected=${application.id}`,
    });
  }
  ranked.sort((left, right) => (right.coverage ?? -1) - (left.coverage ?? -1));
  return { job, ranked: ranked.slice(0, 5), manual, corpus };
}

export async function summarizeFeedback(input: { actor: CopilotActor; jobId: number; name: string }) {
  const job = await assertJobAccess(input.actor, input.jobId);
  const application = await prisma.application.findFirst({
    where: { jobId: job.id, candidate: { name: { contains: input.name, mode: "insensitive" } } },
    include: {
      candidate: { select: { name: true } },
      evaluations: { select: { interviewerId: true, submittedAt: true, overallScore: true, notes: true } },
    },
  });
  if (!application) return { found: false as const, corpus: [] as string[], lines: [] as string[] };
  if (application.aiEvaluationOptOut) {
    return { found: true as const, optedOut: true as const, name: application.candidate.name, corpus: [] as string[], lines: [manualReviewListing(application.candidate.name)] };
  }
  const visible = visibleScorecards({ viewerInterviewerId: input.actor.interviewerId, cards: application.evaluations });
  const lines = visible.flatMap((card) => (card.notes?.trim() ? [card.notes.trim()] : []));
  return { found: true as const, optedOut: false as const, name: application.candidate.name, applicationId: application.id, corpus: lines, lines };
}

export async function answerCopilot(input: { actor: CopilotActor; companyId: number; jobId: number | null; question: string }) {
  if (input.actor.companyId != null && input.companyId !== 0 && input.companyId !== input.actor.companyId) {
    throw new Error("You cannot access this job.");
  }
  const scopedJob = input.jobId ? await assertJobAccess(input.actor, input.jobId) : null;
  const companyId = scopedJob?.companyId ?? input.actor.companyId;
  if (companyId == null) throw new Error("You cannot access this job.");
  await consumeAuthRateLimit({ name: "copilotUser", key: rateLimitKeyForUser(input.actor.userId) }).catch((error) => {
    if (error instanceof RateLimitError) throw error;
    throw error;
  });
  const cutoff = new Date(Date.now() - COPILOT_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.copilotMessage.deleteMany({ where: { companyId, createdAt: { lt: cutoff } } });
  await prisma.copilotMessage.create({
    data: { companyId, jobId: input.jobId, userId: input.actor.userId, role: "user", body: input.question, citations: [], toolCalls: [] },
  });

  if (protectedQuestion(input.question)) {
    const answer = refusalForProtectedQuestion();
    await prisma.copilotMessage.create({
      data: { companyId, jobId: input.jobId, userId: input.actor.userId, role: "assistant", body: answer, citations: [], toolCalls: [{ tool: "refuse_protected" }] },
    });
    return { answer, citations: [] as CopilotCitation[], action: null as CopilotAction | null, link: null };
  }

  const jobId = input.jobId;
  if (!jobId) {
    const answer = "Ask this from a job page, or name the job. I only answer from HireIQ data for a job you can access.";
    await prisma.copilotMessage.create({
      data: { companyId, jobId: null, userId: input.actor.userId, role: "assistant", body: answer, citations: [], toolCalls: [] },
    });
    return { answer, citations: [] as CopilotCitation[], action: null, link: null };
  }

  const skill = input.question.match(/kubernetes|postgres|redis|grpc|go\b/i)?.[0] ?? "";
  const feedbackName = input.question.match(/feedback for ([A-Za-z ]+)/i)?.[1]?.trim();
  let answer = "I don't have that in this job's data.";
  let citations: CopilotCitation[] = [];
  let corpus: string[] = [];
  const toolCalls: Array<{ tool: string }> = [];
  let action: CopilotAction | null = null;
  let link: { label: string; href: string } | null = null;

  if (/stuck|bottleneck|time in stage|pipeline/i.test(input.question)) {
    toolCalls.push({ tool: "pipeline_stats" });
    await assertJobAccess(input.actor, jobId);
    const rows = await prisma.application.groupBy({ by: ["status"], where: { jobId }, _count: { _all: true } });
    answer = rows.length === 0
      ? "I don't have applications for this job yet."
      : `Pipeline counts: ${rows.map((row) => `${row.status} ${row._count._all}`).join(", ")}.`;
  } else if (feedbackName) {
    toolCalls.push({ tool: "summarize_feedback" });
    const feedback = await summarizeFeedback({ actor: input.actor, jobId, name: feedbackName });
    corpus = feedback.corpus;
    if (!feedback.found) answer = `I couldn't find ${feedbackName} on this job.`;
    else if (feedback.optedOut) answer = feedback.lines[0] ?? manualReviewListing(feedback.name);
    else if (feedback.lines.length === 0) answer = `I don't have submitted interview feedback for ${feedback.name}.`;
    else {
      answer = `Submitted feedback for ${feedback.name}: ${feedback.lines[0]}`;
      citations = [{ label: feedback.name, quote: feedback.lines[0] ?? "", href: `/dashboard/jobs/${jobId}/review?selected=${feedback.applicationId}` }];
    }
  } else if (/past candidates/i.test(input.question)) {
    toolCalls.push({ tool: "past_candidates" });
    await assertJobAccess(input.actor, jobId);
    const past = await loadTalentRediscovery(jobId);
    const names = past.results.slice(0, 5).map((row) => row.name).join(", ");
    answer = names ? `Past candidates already found: ${names}.` : "No past-candidate search is cached for this job yet.";
  } else if (skill) {
    toolCalls.push({ tool: "search_candidates" });
    const found = await searchCandidates({ actor: input.actor, jobId, skill });
    corpus = found.corpus;
    answer = formatCandidateSearch({ skill, ranked: found.ranked, manual: found.manual });
    citations = found.ranked.filter((row) => row.quote).map((row) => ({ label: row.name, quote: row.quote, href: row.href }));
    if (found.ranked.length + found.manual.length < 5) {
      toolCalls.push({ tool: "past_candidates" });
      const past = await loadTalentRediscovery(jobId);
      const known = new Set(found.ranked.map((row) => row.name));
      const extra = past.results.filter((row) => {
        if (known.has(row.name)) return false;
        const requirements = Array.isArray(row.requirements) ? row.requirements : [];
        return requirements.some((item) => requirementMatchesSkill({
          skill,
          key: item.key,
          quote: item.quote,
          result: item.result,
        }));
      }).length;
      const label = pastCandidateHint(extra);
      if (label) link = { label, href: `/dashboard/jobs/${jobId}/review?tab=past` };
    }
  } else if (/draft|rejection|reschedule|invite/i.test(input.question)) {
    toolCalls.push({ tool: "draft_message" });
    const draft = draftMessage({ name: "the candidate", purpose: /reschedule/i.test(input.question) ? "reschedule" : /reject/i.test(input.question) ? "rejection" : "invite", jobTitle: "this role" });
    answer = draft.draft;
    action = { kind: "send_draft", label: "Send this draft", applicationIds: [], draft: draft.draft, confirmed: false };
  }

  const grounded = answerWithCitations({ answer, citations, corpus });
  if (process.env.OPENAI_API_KEY?.trim() && process.env.VITEST !== "true") {
    await withAIRun("copilot", { userId: input.actor.userId }, {
      companyId,
      entityType: "Job",
      entityId: jobId,
      model: "gpt-4o-mini",
      promptVersion: "copilot-1",
      input: { question: input.question, tools: toolCalls },
    }, async () => ({ value: grounded.answer, output: { tools: toolCalls } })).catch(() => grounded.answer);
  }
  await prisma.copilotMessage.create({
    data: {
      companyId,
      jobId,
      userId: input.actor.userId,
      role: "assistant",
      body: grounded.answer,
      citations: grounded.citations,
      toolCalls,
    },
  });
  return { answer: grounded.answer, citations: grounded.citations, action, link };
}

export async function confirmCopilotAction(input: { actor: CopilotActor; action: CopilotAction }) {
  if (!input.action.confirmed) throw new Error("Confirmation required.");
  if (input.action.kind === "send_draft") {
    throw new Error("Sending a draft needs a recipient chosen in the review queue. The draft was not sent.");
  }
  for (const applicationId of input.action.applicationIds) {
    const application = await prisma.application.findFirst({
      where: { id: applicationId, companyId: input.actor.companyId ?? -1 },
      select: { id: true },
    });
    if (!application) throw new Error("You cannot access this job.");
    await applyReviewDecision({
      applicationId,
      actorUserId: input.actor.userId,
      action: input.action.kind === "shortlist" ? "shortlist" : "advance",
    });
  }
}
