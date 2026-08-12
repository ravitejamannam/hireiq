import Link from "next/link";
import type { JobStatus, RequirementLifecycle } from "@prisma/client";

import {
  clientJobStatusLabels,
  clientRequirementLifecycleLabels,
  formatClientDate,
  type ClientPipelineCounts,
} from "@/components/client/client-labels";

type ClientRequirementCardProps = {
  id: number;
  title: string;
  companyName: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  location: string | null;
  numberOfPositions: number | null;
  targetHireDate: Date | null;
  profileCount: number;
  shortlistedCount: number;
  selectedCount: number;
  pipelineCounts?: ClientPipelineCounts;
};

export default function ClientRequirementCard({
  id,
  title,
  companyName,
  status,
  requirementLifecycle,
  location,
  numberOfPositions,
  targetHireDate,
  profileCount,
  shortlistedCount,
  selectedCount,
  pipelineCounts,
}: ClientRequirementCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Requirement / Role
          </p>
          <h3 className="mt-2 text-xl font-bold text-black">{title}</h3>
          <p className="mt-1 text-sm text-zinc-600">{companyName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            {clientJobStatusLabels[status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            {clientRequirementLifecycleLabels[requirementLifecycle]}
          </span>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-medium text-black">Location</dt>
          <dd>{location || "Not set"}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Positions</dt>
          <dd>{numberOfPositions ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Target hire date</dt>
          <dd>{formatClientDate(targetHireDate)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Profiles</dt>
          <dd>{profileCount}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Shortlisted</dt>
          <dd>{shortlistedCount}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Selected</dt>
          <dd>{selectedCount}</dd>
        </div>
      </dl>

      {pipelineCounts ? (
        <div className="mt-5 border-t border-zinc-200 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Pipeline
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-600 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="font-medium text-black">CV Pool</dt>
              <dd>{pipelineCounts.cvPool}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Expert Review</dt>
              <dd>{pipelineCounts.expertReview}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Tech Eval</dt>
              <dd>{pipelineCounts.techEvaluation}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Shortlisted</dt>
              <dd>{pipelineCounts.shortlisted}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Selected</dt>
              <dd>{pipelineCounts.selected}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Hired</dt>
              <dd>{pipelineCounts.hired}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="mt-5">
        <Link
          href={`/client/requirements/${id}`}
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          View Requirement
        </Link>
      </div>
    </article>
  );
}
