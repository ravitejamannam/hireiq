import { notFound } from "next/navigation";
import Link from "next/link";

import ClientShortlistReview, {
  type ClientShortlistItem,
} from "@/components/client/ClientShortlistReview";
import {
  getClientTechnicalEvaluationStatus,
  selectPrimaryClientEvaluation,
} from "@/components/client/client-labels";
import { requireClientPortal } from "@/lib/auth/authorization";
import {
  getClientApplicationsForRequirement,
  getClientShortlistedApplicationsForRequirement,
} from "@/lib/repositories/application-repository";
import { getJobById } from "@/lib/repositories/job-repository";

type ClientShortlistPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientShortlistPage({
  params,
  searchParams,
}: ClientShortlistPageProps) {
  // Ignore tenant query params — company comes from the session User only.
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

  const [applications, shortlisted] = await Promise.all([
    getClientApplicationsForRequirement(requirementId),
    getClientShortlistedApplicationsForRequirement(requirementId),
  ]);

  const selectedCount = applications.filter(
    (application) => application.status === "SELECTED",
  ).length;
  const hiredCount = applications.filter(
    (application) => application.status === "HIRED",
  ).length;

  const items: ClientShortlistItem[] = shortlisted.map((application) => {
    const evaluation = selectPrimaryClientEvaluation(application.evaluations);

    return {
      applicationId: application.id,
      requirementId,
      name: application.candidate.name,
      role: application.candidate.role,
      currentEmployer: application.candidate.currentEmployer,
      location: application.candidate.location,
      experienceYears: application.candidate.experienceYears,
      skills: application.candidate.skills,
      expectedCTC: application.candidate.expectedCTC,
      source: application.source,
      expertScore: application.expertScore,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
      interviewerName: application.job.assignedInterviewer?.name ?? null,
      technicalEvaluationStatus: getClientTechnicalEvaluationStatus(evaluation),
      overallScore: evaluation?.overallScore ?? null,
      recommendation: evaluation?.recommendation ?? null,
      hireProbability: evaluation?.hireProbability ?? null,
      fitDecision: evaluation?.fitDecision ?? null,
      hasEvaluation: evaluation !== null,
      status: application.status,
      updatedAt: application.updatedAt.toISOString(),
      evaluatedAt: evaluation?.evaluatedAt
        ? evaluation.evaluatedAt.toISOString()
        : null,
    };
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href={`/client/requirements/${requirementId}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirement
        </Link>
        <Link
          href="/client/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <ClientShortlistReview
        requirement={{
          id: requirement.id,
          title: requirement.title,
          companyName: requirement.company.name,
          status: requirement.status,
          requirementLifecycle: requirement.requirementLifecycle,
        }}
        candidateCount={applications.length}
        selectedCount={selectedCount}
        hiredCount={hiredCount}
        items={items}
      />
    </div>
  );
}
