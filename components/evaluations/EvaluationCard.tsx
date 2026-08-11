import type {
  EvaluationFitDecision,
  Recommendation,
} from "@prisma/client";
import {
  getFitDecisionLabel,
  getRecommendationLabel,
} from "@/components/evaluations/EvaluationForm";

type EvaluationCardProps = {
  id: number;
  candidateName: string;
  candidateRole: string;
  currentEmployer: string | null;
  jobTitle: string;
  companyName: string;
  interviewerName: string;
  overallScore: number | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: Date | null;
  isDeleting?: boolean;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

function formatEvaluatedAt(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default function EvaluationCard({
  id,
  candidateName,
  candidateRole,
  currentEmployer,
  jobTitle,
  companyName,
  interviewerName,
  overallScore,
  recommendation,
  hireProbability,
  fitDecision,
  evaluatedAt,
  isDeleting = false,
  onEdit,
  onDelete,
}: EvaluationCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-black">{candidateName}</h3>
          <p className="mt-1 text-zinc-500">{candidateRole}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {jobTitle} - {companyName}
          </p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {getFitDecisionLabel(fitDecision)}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-black">Current Employer</dt>
          <dd>{formatOptional(currentEmployer)}</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Interviewer</dt>
          <dd>{interviewerName}</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Overall Score</dt>
          <dd>{formatOptional(overallScore)}</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Recommendation</dt>
          <dd>{getRecommendationLabel(recommendation)}</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Hire Probability</dt>
          <dd>{formatOptional(hireProbability)}</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Fit Decision</dt>
          <dd>{getFitDecisionLabel(fitDecision)}</dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="font-medium text-black">Evaluated At</dt>
          <dd>
            {evaluatedAt ? formatEvaluatedAt(evaluatedAt) : "Not provided"}
          </dd>
        </div>
      </dl>

      <div className="mt-8 border-t border-zinc-200 pt-4">
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onEdit(id)}
            disabled={isDeleting}
            className="
              rounded-lg
              border
              border-zinc-300
              px-4
              py-2
              text-sm
              font-medium
              text-black
              hover:bg-zinc-100
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            View / Edit
          </button>

          <button
            type="button"
            onClick={() => onDelete(id)}
            disabled={isDeleting}
            className="
              rounded-lg
              border
              border-red-200
              px-4
              py-2
              text-sm
              font-medium
              text-red-600
              hover:bg-red-50
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}
