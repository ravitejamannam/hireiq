import { notFound } from "next/navigation";
import Link from "next/link";

import ClientRequirementWorkspace from "@/components/client/ClientRequirementWorkspace";
import { countPipelineStatuses } from "@/components/client/client-labels";
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
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href="/client/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
        <Link
          href="/client"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          Dashboard
        </Link>
      </div>

      <ClientRequirementWorkspace
        key={`${requirement.id}-${requirement.requirementLifecycle}-${requirement.updatedAt.toISOString()}`}
        requirement={{
          id: requirement.id,
          title: requirement.title,
          companyName: requirement.company.name,
          status: requirement.status,
          requirementLifecycle: requirement.requirementLifecycle,
          roleCategory: requirement.roleCategory,
          experienceRange: requirement.experienceRange,
          location: requirement.location,
          compensationRange: requirement.compensationRange,
          targetHireDate: requirement.targetHireDate
            ? requirement.targetHireDate.toISOString()
            : null,
          numberOfPositions: requirement.numberOfPositions,
          mustHaveRequirements: requirement.mustHaveRequirements,
          niceToHaveRequirements: requirement.niceToHaveRequirements,
          jobDescription: requirement.jobDescription,
          evaluationCriteria: requirement.evaluationCriteria,
          primarySkills: requirement.primarySkills,
          clientCompletedAt: requirement.clientCompletedAt
            ? requirement.clientCompletedAt.toISOString()
            : null,
          applicationCount: requirement._count.applications,
          pipelineCounts,
        }}
      />
    </div>
  );
}
