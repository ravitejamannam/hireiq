"use client";

import Link from "next/link";
import type {
  ApplicationPipelineStatus,
  EvaluationFitDecision,
  Recommendation,
} from "@prisma/client";

import ClientHireConfirmation from "@/components/client/ClientHireConfirmation";
import {
  formatClientOptional,
  getClientFitDecisionLabel,
  getClientPipelineStatusLabel,
  getClientRecommendationLabel,
  getClientSourceLabel,
} from "@/components/client/client-labels";

export type ClientShortlistCardData = {
  applicationId: number;
  requirementId: number;
  name: string;
  role: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  source: string | null;
  expertScore: number | null;
  jobTitle: string;
  companyName: string;
  interviewerName: string | null;
  technicalEvaluationStatus: string;
  overallScore: number | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  hasEvaluation: boolean;
  status: ApplicationPipelineStatus;
  compareSelected?: boolean;
  onToggleCompare?: () => void;
  onSelectCandidate?: () => void;
  isSelecting?: boolean;
  selectDisabled?: boolean;
};

type ClientShortlistCardProps = {
  candidate: ClientShortlistCardData;
};

export default function ClientShortlistCard({
  candidate,
}: ClientShortlistCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {candidate.status === "SHORTLISTED"
              ? "Recommended candidate"
              : candidate.status === "SELECTED"
                ? "Selected candidate"
                : candidate.status === "HIRED"
                  ? "Hired candidate"
                  : "Candidate"}
          </p>
          <h3 className="mt-2 text-xl font-bold text-black">{candidate.name}</h3>
          <p className="mt-1 text-sm text-zinc-600">{candidate.role}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
          {getClientPipelineStatusLabel(candidate.status)}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p className="font-medium text-black">Why shortlisted</p>
        {candidate.hasEvaluation ? (
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-zinc-500">Expert Score</dt>
              <dd className="font-medium text-black">
                {formatClientOptional(candidate.expertScore)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Overall Score</dt>
              <dd className="font-medium text-black">
                {formatClientOptional(candidate.overallScore)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Recommendation</dt>
              <dd className="font-medium text-black">
                {getClientRecommendationLabel(candidate.recommendation)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Hire Probability</dt>
              <dd className="font-medium text-black">
                {formatClientOptional(candidate.hireProbability)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Fit Decision</dt>
              <dd className="font-medium text-black">
                {getClientFitDecisionLabel(candidate.fitDecision)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2">Evaluation not available yet.</p>
        )}
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-medium text-black">Current employer</dt>
          <dd>{formatClientOptional(candidate.currentEmployer)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Location</dt>
          <dd>{formatClientOptional(candidate.location)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Experience</dt>
          <dd>{candidate.experienceYears} years</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expected CTC</dt>
          <dd>{formatClientOptional(candidate.expectedCTC)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Source</dt>
          <dd>{getClientSourceLabel(candidate.source)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Technical evaluation</dt>
          <dd>{candidate.technicalEvaluationStatus}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="font-medium text-black">Skills</dt>
          <dd>{formatClientOptional(candidate.skills)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/client/requirements/${candidate.requirementId}/candidates/${candidate.applicationId}`}
          className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100"
        >
          View Candidate
        </Link>
        {candidate.status === "SHORTLISTED" && candidate.onSelectCandidate ? (
          <button
            type="button"
            onClick={candidate.onSelectCandidate}
            disabled={candidate.selectDisabled || candidate.isSelecting}
            className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {candidate.isSelecting ? "Selecting..." : "Select Candidate"}
          </button>
        ) : null}
        {candidate.onToggleCompare ? (
          <button
            type="button"
            onClick={candidate.onToggleCompare}
            disabled={candidate.isSelecting}
            className={`inline-flex rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
              candidate.compareSelected
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 bg-white text-black hover:bg-zinc-100"
            }`}
          >
            {candidate.compareSelected ? "Selected for Compare" : "Compare"}
          </button>
        ) : null}
      </div>

      {candidate.status === "SELECTED" || candidate.status === "HIRED" ? (
        <div className="mt-4">
          <ClientHireConfirmation
            applicationId={candidate.applicationId}
            candidateName={candidate.name}
            status={candidate.status}
          />
        </div>
      ) : null}
    </article>
  );
}
