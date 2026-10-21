import Link from "next/link";
import { notFound } from "next/navigation";

import AssessmentGradeEditor from "@/components/screening/AssessmentGradeEditor";
import PracticalGrader from "@/components/screening/PracticalGrader";
import { loadInviteForReview } from "@/lib/assessments/generated-assessment-service";
import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { loadPracticalForReview, similarPracticalSubmissions } from "@/lib/screening/practical-service";

type PageProps = { params: Promise<{ id: string; applicationId: string }> };

function when(value: Date | null | undefined) {
  return value ? value.toLocaleString() : "—";
}

function integritySummary(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tabs = typeof record.tabSwitches === "number" ? record.tabSwitches : null;
  const pastes = typeof record.pastes === "number" ? record.pastes : null;
  if (tabs === null && pastes === null) return null;
  return `${tabs ?? 0} tab switch(es), ${pastes ?? 0} paste(s). Context only; not evidence of misconduct.`;
}

export default async function EvaluationPage({ params }: PageProps) {
  const { id, applicationId: rawApplicationId } = await params;
  const jobId = Number(id);
  const applicationId = Number(rawApplicationId);
  if (!Number.isInteger(jobId) || !Number.isInteger(applicationId) || jobId < 1 || applicationId < 1) notFound();
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) notFound();
  const application = await prisma.application.findFirst({
    where: { id: applicationId, jobId, companyId: job.companyId },
    select: {
      id: true,
      status: true,
      aiEvaluationOptOut: true,
      humanReviewRequestedAt: true,
      candidate: { select: { name: true, role: true } },
    },
  });
  if (!application) notFound();

  const [generated, bank, practicalRow] = await Promise.all([
    loadInviteForReview(application.id, job.companyId),
    prisma.assessmentInvite.findFirst({
      where: { applicationId: application.id, application: { companyId: job.companyId } },
      select: {
        roleCategory: true,
        expiresAt: true,
        attempt: {
          select: {
            status: true,
            score: true,
            maxScore: true,
            submittedAt: true,
            integritySignals: true,
            answers: { select: { id: true, isCorrect: true, selectedIndex: true, question: { select: { prompt: true, choices: true, skillTag: true } } } },
          },
        },
      },
    }),
    prisma.codingTest.findFirst({
      where: { applicationId: application.id, screeningPolicyId: { not: null }, application: { companyId: job.companyId } },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
  ]);
  const practical = practicalRow ? await loadPracticalForReview(practicalRow.id, job.companyId) : null;
  const similar = practical?.submittedAt ? await similarPracticalSubmissions(practical.id, job.companyId) : [];

  const targets = [
    { targetType: "APPLICATION", targetId: application.id },
    ...(generated ? [{ targetType: "GENERATED_ASSESSMENT_INVITE", targetId: generated.id }] : []),
    ...(practical ? [{ targetType: "CODING_TEST", targetId: practical.id }] : []),
  ];
  const history = await prisma.auditLog.findMany({
    where: { companyId: job.companyId, OR: targets },
    orderBy: { occurredAt: "desc" },
    take: 50,
    select: { id: true, occurredAt: true, action: true, actorRole: true, reason: true, actor: { select: { name: true } } },
  });

  const humanOnly = application.aiEvaluationOptOut || application.humanReviewRequestedAt !== null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header>
        <Link className="text-sm underline" href={`/dashboard/jobs/${jobId}/review?selected=${application.id}`}>← Back to review queue</Link>
        <h1 className="mt-2 text-2xl font-bold text-black">{application.candidate.name}</h1>
        <p className="text-sm text-zinc-600">
          {job.title} · stage {application.status.replace(/_/g, " ").toLowerCase()}
          {humanOnly ? " · Human-only grading (candidate opted out of AI or asked for human review)" : ""}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Basic assessment</h2>
        {generated ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-zinc-600">
              Job assessment v{generated.assessmentVersion} · started {when(generated.startedAt)} · submitted {when(generated.submittedAt)} · grading{" "}
              {generated.submittedAt ? (generated.gradedAt ? "finished" : "did not finish") : "not started"}
              {generated.extraTimeRequested ? " · extra time granted" : ""}
            </p>
            {integritySummary(generated.integrity) ? <p className="text-xs text-zinc-500">{integritySummary(generated.integrity)}</p> : null}
            {generated.submittedAt ? (
              <AssessmentGradeEditor
                inviteId={generated.id}
                gradingFinished={generated.gradedAt !== null}
                items={generated.items.map((item) => ({
                  id: item.id,
                  type: item.type,
                  prompt: item.prompt,
                  requirement: item.requirement,
                  max: item.max,
                  answer: item.answer,
                  correctChoice: item.correctChoice,
                  grade: item.grade
                    ? {
                        score: item.grade.score,
                        needsHuman: item.grade.needsHuman,
                        quote: item.grade.quote,
                        reason: item.grade.reason ?? null,
                        overrideReason: item.grade.overrideReason ?? null,
                      }
                    : null,
                }))}
              />
            ) : (
              <p className="text-sm text-zinc-500">Not submitted yet. Answers appear here after the candidate submits.</p>
            )}
          </div>
        ) : null}
        {bank?.attempt ? (
          <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
            <p className="text-sm text-zinc-600">
              Role assessment ({String(bank.roleCategory).toLowerCase()}) · {bank.attempt.status.toLowerCase()}
              {bank.attempt.status === "COMPLETED" ? ` · ${bank.attempt.score} / ${bank.attempt.maxScore} points` : ""} · submitted {when(bank.attempt.submittedAt)}
            </p>
            {integritySummary(bank.attempt.integritySignals) ? <p className="text-xs text-zinc-500">{integritySummary(bank.attempt.integritySignals)}</p> : null}
            {bank.attempt.answers.length > 0 ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {bank.attempt.answers.map((answer) => {
                  const choices = Array.isArray(answer.question.choices) ? (answer.question.choices as string[]) : [];
                  return (
                    <li key={answer.id}>
                      {answer.question.prompt}{" "}
                      <span className={answer.isCorrect ? "text-emerald-700" : "text-zinc-500"}>
                        — {choices[answer.selectedIndex] ?? "No answer"} ({answer.isCorrect ? "correct" : "incorrect"})
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        ) : null}
        {!generated && !bank?.attempt ? <p className="mt-2 text-sm text-zinc-500">No basic assessment has been sent.</p> : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Practical assessment</h2>
        {practical ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-zinc-600">
              {practical.title} · rubric v{practical.rubricVersion ?? "?"} · assigned {when(practical.assignedAt)} · due {when(practical.dueAt)} · submitted{" "}
              {when(practical.submittedAt)}
            </p>
            {practical.submittedAt ? (
              <>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <h3 className="text-sm font-semibold">Submission</h3>
                  {practical.submissionUrl ? (
                    <p className="mt-1 text-sm">
                      Link:{" "}
                      <a className="underline" href={practical.submissionUrl} target="_blank" rel="noreferrer noopener nofollow">
                        {practical.submissionUrl}
                      </a>
                    </p>
                  ) : null}
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-sm">{practical.submissionText}</pre>
                  {similar.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" role="note">
                      <p className="font-semibold text-amber-900">Similar submissions to look at</p>
                      <ul className="mt-1 list-disc pl-5">
                        {similar.map((row) => (
                          <li key={row.codingTestId}>
                            <Link className="underline" href={`/dashboard/jobs/${job.id}/evaluation/${row.applicationId}`}>{row.candidateName}</Link>: {Math.round(row.similarity * 100)}% wording overlap
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-amber-900">
                        Overlap is a reason to read both, not evidence of copying. Shared starter code, the task wording, and common libraries
                        all create overlap. It does not change any score or status; record a decision only after reading both submissions.
                      </p>
                    </div>
                  ) : null}
                </div>
                <PracticalGrader
                  codingTestId={practical.id}
                  humanOnly={humanOnly}
                  graded={practical.gradedAt !== null}
                  score={practical.gradedAt ? { points: practical.score, max: practical.maxScore } : null}
                  criteria={practical.criteria.map((criterion) => ({
                    key: criterion.key,
                    label: criterion.label,
                    description: criterion.description,
                    maxPoints: criterion.maxPoints,
                    human: criterion.human ? { points: criterion.human.points, rationale: criterion.human.rationale, by: criterion.human.gradedBy?.name ?? null } : null,
                    suggestion: criterion.suggestion
                      ? { points: criterion.suggestion.points, rationale: criterion.suggestion.rationale, quote: criterion.suggestion.evidenceQuote }
                      : null,
                  }))}
                />
              </>
            ) : (
              <p className="text-sm text-zinc-500">{practical.state === "OVERDUE" ? "Deadline passed without a submission." : "Waiting for the candidate to submit."}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No practical has been assigned.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">History</h2>
        {history.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="border-b border-zinc-100 pb-2">
                <span className="font-medium">{entry.action.replace(/_/g, " ").toLowerCase()}</span>{" "}
                <span className="text-zinc-500">
                  · {entry.occurredAt.toLocaleString()} · {entry.actorRole.startsWith("CANDIDATE") ? "candidate" : entry.actor?.name ?? entry.actorRole.toLowerCase()}
                </span>
                {entry.reason ? <span className="block break-words text-xs text-zinc-600">{entry.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No recorded activity yet.</p>
        )}
      </section>
    </main>
  );
}
