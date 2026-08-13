import Link from "next/link";
import type {
  ApplicationPipelineStatus,
  EvaluationFitDecision,
  Recommendation,
} from "@prisma/client";

import {
  formatClientOptional,
  getClientFitDecisionLabel,
  getClientPipelineStatusLabel,
  getClientRecommendationLabel,
} from "@/components/client/client-labels";

export type ClientCandidateCardData = {
  applicationId: number;
  requirementId: number;
  name: string;
  role: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  status: ApplicationPipelineStatus;
  expertScore: number | null;
  technicalEvaluationStatus: string;
  recommendation: Recommendation | null;
  fitDecision: EvaluationFitDecision | null;
};

type ClientCandidateCardProps = {
  candidate: ClientCandidateCardData;
};

export default function ClientCandidateCard({
  candidate,
}: ClientCandidateCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Candidate
          </p>
          <h3 className="mt-2 text-xl font-bold text-black">{candidate.name}</h3>
          <p className="mt-1 text-sm text-zinc-600">{candidate.role}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
          {getClientPipelineStatusLabel(candidate.status)}
        </span>
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
          <dt className="font-medium text-black">Expert score</dt>
          <dd>{formatClientOptional(candidate.expertScore)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Technical evaluation</dt>
          <dd>{candidate.technicalEvaluationStatus}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Recommendation</dt>
          <dd>{getClientRecommendationLabel(candidate.recommendation)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Fit decision</dt>
          <dd>{getClientFitDecisionLabel(candidate.fitDecision)}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="font-medium text-black">Skills</dt>
          <dd>{formatClientOptional(candidate.skills)}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <Link
          href={`/client/requirements/${candidate.requirementId}/candidates/${candidate.applicationId}`}
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          View Candidate
        </Link>
      </div>
    </article>
  );
}
