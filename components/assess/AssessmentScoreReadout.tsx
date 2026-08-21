import type { AssessmentAttemptStatus } from "@prisma/client";

import { formatClientDateTime } from "@/components/client/client-labels";

export type AssessmentScoreSummary = {
  status: AssessmentAttemptStatus;
  score: number;
  maxScore: number;
  expiresAt: string;
  submittedAt: string | null;
};

function statusLabel(status: AssessmentAttemptStatus) {
  switch (status) {
    case "COMPLETED":
      return "Completed";
    case "IN_PROGRESS":
      return "In progress";
    case "EXPIRED":
      return "Window closed";
    default:
      return "Not started";
  }
}

export default function AssessmentScoreReadout({
  summary,
}: {
  summary: AssessmentScoreSummary | null;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Role assessment</h2>
      {!summary ? (
        <p className="mt-4 text-sm text-zinc-600">
          No hosted-apply assessment yet.
        </p>
      ) : (
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Status</dt>
            <dd>{statusLabel(summary.status)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Score</dt>
            <dd>
              {summary.status === "COMPLETED"
                ? `${summary.score} / ${summary.maxScore}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Window ends</dt>
            <dd>{formatClientDateTime(new Date(summary.expiresAt))}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Submitted</dt>
            <dd>
              {summary.submittedAt
                ? formatClientDateTime(new Date(summary.submittedAt))
                : "Not submitted"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
