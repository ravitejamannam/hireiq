import Link from "next/link";

import {
  formatClientDate,
  formatClientOptional,
  getClientFitDecisionLabel,
  getClientPipelineStatusLabel,
  getClientRecommendationLabel,
} from "@/components/client/client-labels";
import { getInterviewerEvaluations } from "@/lib/repositories/interviewer-portal-repository";

export default async function InterviewerEvaluationsPage() {
  const evaluations = await getInterviewerEvaluations();

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Evaluations</h1>
        <p className="mt-2 text-zinc-600">
          Your evaluations across assigned requirements.
        </p>
      </div>

      {evaluations.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            You have not created any evaluations yet.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {evaluations.map((evaluation) => (
            <article
              key={evaluation.id}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-black">
                    {evaluation.application.candidate.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    {evaluation.application.job.title} ·{" "}
                    {evaluation.application.job.company.name}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                  {evaluation.evaluatedAt ? "Completed" : "In progress"}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="font-medium text-black">Role</dt>
                  <dd>{evaluation.application.candidate.role}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Pipeline</dt>
                  <dd>
                    {getClientPipelineStatusLabel(
                      evaluation.application.status,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Overall score</dt>
                  <dd>{formatClientOptional(evaluation.overallScore)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Recommendation</dt>
                  <dd>
                    {getClientRecommendationLabel(evaluation.recommendation)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Fit decision</dt>
                  <dd>{getClientFitDecisionLabel(evaluation.fitDecision)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Evaluated at</dt>
                  <dd>{formatClientDate(evaluation.evaluatedAt)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <Link
                  href={`/interviewer/requirements/${evaluation.application.job.id}/candidates/${evaluation.application.id}`}
                  className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Open Evaluation
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
