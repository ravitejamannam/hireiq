import { notFound } from "next/navigation";
import Link from "next/link";

import {
  clientJobStatusLabels,
  clientRequirementLifecycleLabels,
  countPipelineStatuses,
  formatClientDate,
} from "@/components/client/client-labels";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getJobById } from "@/lib/repositories/job-repository";

type ClientRequirementDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientRequirementDetailPage({
  params,
  searchParams,
}: ClientRequirementDetailPageProps) {
  // Explicitly ignore tenant query params — company comes from the session User.
  void searchParams;

  await requireClientPortal();

  const { id } = await params;
  const requirementId = Number(id);

  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    notFound();
  }

  const requirement = await getJobById(requirementId);

  if (!requirement) {
    notFound();
  }

  const pipelineCounts = countPipelineStatuses(
    requirement.applications.map((application) => application.status),
  );

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/client/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Requirement
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">
            {requirement.title}
          </h1>
          <p className="mt-2 text-zinc-600">{requirement.company.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            {clientJobStatusLabels[requirement.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            {
              clientRequirementLifecycleLabels[
                requirement.requirementLifecycle
              ]
            }
          </span>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Role details</h2>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd>{requirement.location || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Compensation</dt>
            <dd>{requirement.compensationRange || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Experience</dt>
            <dd>{requirement.experienceRange || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Positions</dt>
            <dd>{requirement.numberOfPositions ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Target hire date</dt>
            <dd>{formatClientDate(requirement.targetHireDate)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Lifecycle</dt>
            <dd>
              {
                clientRequirementLifecycleLabels[
                  requirement.requirementLifecycle
                ]
              }
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Pipeline summary</h2>
        {requirement._count.applications === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            No candidates are currently in the recruitment pipeline.
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-zinc-600 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="font-medium text-black">CV Pool</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {pipelineCounts.cvPool}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Expert Review</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {pipelineCounts.expertReview}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Tech Eval</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {pipelineCounts.techEvaluation}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Shortlisted</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {pipelineCounts.shortlisted}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Selected</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {pipelineCounts.selected}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Hired</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {pipelineCounts.hired}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
