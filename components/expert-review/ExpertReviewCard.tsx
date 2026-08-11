"use client";

import Link from "next/link";
import {
  ApplicationPipelineStatus,
  type SourcingDatabaseSource,
} from "@prisma/client";

import {
  getApplicationPipelineStatusLabel,
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";

type ExpertReviewCardProps = {
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
  jobTitle: string;
  companyName: string;
  hasEvaluation: boolean;
  evaluationId: number | null;
  isMoving?: boolean;
  onStartReview?: (id: number) => void;
  onOpenReview?: (id: number) => void;
  onMoveToTechEvaluation?: (id: number) => void;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

export default function ExpertReviewCard({
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
  jobTitle,
  companyName,
  hasEvaluation,
  evaluationId,
  isMoving = false,
  onStartReview,
  onOpenReview,
  onMoveToTechEvaluation,
}: ExpertReviewCardProps) {
  const isCvPool = status === ApplicationPipelineStatus.CV_POOL;
  const isExpertReview = status === ApplicationPipelineStatus.EXPERT_REVIEW;

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
        {isExpertReview && (
          <>
            <div>
              <dt className="font-medium text-black">Expert score</dt>
              <dd>
                {expertScore === null || expertScore === undefined
                  ? "Not evaluated"
                  : expertScore}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-black">Evaluation</dt>
              <dd>
                {hasEvaluation ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    Evaluation recorded
                    {evaluationId ? (
                      <Link
                        href="/dashboard/evaluations"
                        className="font-medium text-black underline underline-offset-2"
                      >
                        View Evaluation
                      </Link>
                    ) : null}
                  </span>
                ) : (
                  "No evaluation recorded"
                )}
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        {isCvPool && onStartReview && (
          <button
            type="button"
            onClick={() => onStartReview(id)}
            disabled={isMoving}
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMoving ? "Moving..." : "Start Expert Review"}
          </button>
        )}

        {isExpertReview && onOpenReview && (
          <button
            type="button"
            onClick={() => onOpenReview(id)}
            disabled={isMoving}
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Review
          </button>
        )}

        {isExpertReview && onMoveToTechEvaluation && (
          <button
            type="button"
            onClick={() => onMoveToTechEvaluation(id)}
            disabled={isMoving}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMoving ? "Moving..." : "Move to Tech Evaluation"}
          </button>
        )}
      </div>
    </article>
  );
}
