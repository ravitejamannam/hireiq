"use client";

import Link from "next/link";
import {
  ApplicationPipelineStatus,
  type EvaluationFitDecision,
  type Recommendation,
  type SourcingDatabaseSource,
} from "@prisma/client";

import {
  getApplicationPipelineStatusLabel,
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";
import {
  getFitDecisionLabel,
  getRecommendationLabel,
} from "@/components/evaluations/EvaluationForm";

export type TechnicalEvaluationState =
  | "NOT_EVALUATED"
  | "IN_PROGRESS"
  | "COMPLETED";

type TechnicalEvaluationCardProps = {
  id: number;
  status: ApplicationPipelineStatus;
  candidateName: string;
  role: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  source: SourcingDatabaseSource | null;
  expertScore: number | null;
  overallScore: number | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  jobTitle: string;
  companyName: string;
  interviewerName: string | null;
  evaluationState: TechnicalEvaluationState;
  isMoving?: boolean;
  onStartTechEvaluation?: (id: number) => void;
  onOpenEvaluation?: (id: number) => void;
  onMoveToShortlisted?: (id: number) => void;
  onReject?: (id: number) => void;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

function getEvaluationStateLabel(state: TechnicalEvaluationState) {
  if (state === "COMPLETED") return "Evaluation completed";
  if (state === "IN_PROGRESS") return "Evaluation in progress";
  return "Not evaluated";
}

export default function TechnicalEvaluationCard({
  id,
  status,
  candidateName,
  role,
  currentEmployer,
  location,
  experienceYears,
  skills,
  expectedCTC,
  source,
  expertScore,
  overallScore,
  recommendation,
  hireProbability,
  fitDecision,
  jobTitle,
  companyName,
  interviewerName,
  evaluationState,
  isMoving = false,
  onStartTechEvaluation,
  onOpenEvaluation,
  onMoveToShortlisted,
  onReject,
}: TechnicalEvaluationCardProps) {
  const isExpertReview = status === ApplicationPipelineStatus.EXPERT_REVIEW;
  const isTechEvaluation = status === ApplicationPipelineStatus.TECH_EVALUATION;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-black">{candidateName}</h3>
          <p className="mt-1 text-sm text-zinc-600">{role}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {jobTitle} — {companyName}
          </p>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {getApplicationPipelineStatusLabel(status)}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-black">Current employer</dt>
          <dd>{formatOptional(currentEmployer)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Location</dt>
          <dd>{formatOptional(location)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Experience</dt>
          <dd>{experienceYears} years</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expected CTC</dt>
          <dd>{formatOptional(expectedCTC)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-black">Skills</dt>
          <dd>{formatOptional(skills)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Source</dt>
          <dd>{getApplicationSourceLabel(source)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expert score</dt>
          <dd>
            {expertScore === null || expertScore === undefined
              ? "Not evaluated"
              : expertScore}
          </dd>
        </div>

        {isTechEvaluation && (
          <>
            <div>
              <dt className="font-medium text-black">Overall technical score</dt>
              <dd>{formatOptional(overallScore)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Recommendation</dt>
              <dd>{getRecommendationLabel(recommendation)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Hire probability</dt>
              <dd>{formatOptional(hireProbability)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Fit decision</dt>
              <dd>{getFitDecisionLabel(fitDecision)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Interviewer</dt>
              <dd>{interviewerName || "Not assigned"}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Evaluation state</dt>
              <dd>{getEvaluationStateLabel(evaluationState)}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        {isExpertReview && onStartTechEvaluation && (
          <button
            type="button"
            onClick={() => onStartTechEvaluation(id)}
            disabled={isMoving}
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMoving ? "Moving..." : "Start Tech Evaluation"}
          </button>
        )}

        {isTechEvaluation && onOpenEvaluation && (
          <button
            type="button"
            onClick={() => onOpenEvaluation(id)}
            disabled={isMoving}
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Open Technical Evaluation
          </button>
        )}

        {isTechEvaluation && (
          <Link
            href="/dashboard/interviews"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
          >
            View Interviews
          </Link>
        )}

        {isTechEvaluation && onMoveToShortlisted && (
          <button
            type="button"
            onClick={() => onMoveToShortlisted(id)}
            disabled={isMoving}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMoving ? "Moving..." : "Move to Shortlisted"}
          </button>
        )}

        {isTechEvaluation && onReject && (
          <button
            type="button"
            onClick={() => onReject(id)}
            disabled={isMoving}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMoving ? "Moving..." : "Reject"}
          </button>
        )}
      </div>
    </article>
  );
}
