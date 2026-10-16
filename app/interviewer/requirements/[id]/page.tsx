import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Requirement",
};

import { notFound } from "next/navigation";

import InterviewerRequirementDetailClient from "@/components/interviewer/InterviewerRequirementDetailClient";
import {
  getInterviewerApplicationsForJob,
  getInterviewerAssignedJobById,
} from "@/lib/repositories/interviewer-portal-repository";

type InterviewerRequirementDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InterviewerRequirementDetailPage({
  params,
  searchParams,
}: InterviewerRequirementDetailPageProps) {
  // Ignore tenant query params — interviewer comes from the session User only.
  void searchParams;

  const { id } = await params;
  const requirementId = Number(id);

  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    notFound();
  }

  const requirement = await getInterviewerAssignedJobById(requirementId);

  if (!requirement) {
    notFound();
  }

  const candidates = await getInterviewerApplicationsForJob(requirementId);

  return (
    <InterviewerRequirementDetailClient
      requirement={{
        id: requirement.id,
        title: requirement.title,
        status: requirement.status,
        roleCategory: requirement.roleCategory,
        experienceRange: requirement.experienceRange,
        location: requirement.location,
        compensationRange: requirement.compensationRange,
        targetHireDate: requirement.targetHireDate,
        numberOfPositions: requirement.numberOfPositions,
        mustHaveRequirements: requirement.mustHaveRequirements,
        niceToHaveRequirements: requirement.niceToHaveRequirements,
        jobDescription: requirement.jobDescription,
        evaluationCriteria: requirement.evaluationCriteria,
        primarySkills: requirement.primarySkills,
        structuredPayload:
          requirement.currentPublishedSpecificationVersion?.structuredPayload,
        requirementLifecycle: requirement.requirementLifecycle,
        sourcingAccessReceivedAt: requirement.sourcingAccessReceivedAt,
        shortlistingCompletedAt: requirement.shortlistingCompletedAt,
        createdAt: requirement.createdAt,
        company: requirement.company,
      }}
      candidates={candidates.map((application) => ({
        id: application.id,
        status: application.status,
        source: application.source,
        expertScore: application.expertScore,
        candidate: application.candidate,
        evaluations: application.evaluations.map((evaluation) => ({
          id: evaluation.id,
          evaluatedAt: evaluation.evaluatedAt,
        })),
      }))}
    />
  );
}
