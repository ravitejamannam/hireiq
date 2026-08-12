import { notFound } from "next/navigation";

import RequirementWorkspaceClient from "@/components/requirements/RequirementWorkspaceClient";
import { getApplicationsByJobId } from "@/lib/repositories/application-repository";
import { getEvaluationsByJobId } from "@/lib/repositories/evaluation-repository";
import { getInterviewsByJobId } from "@/lib/repositories/interview-repository";
import { getInterviewers } from "@/lib/repositories/interviewer-repository";
import { getJobById } from "@/lib/repositories/job-repository";

type RequirementWorkspacePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function RequirementWorkspacePage({
  params,
}: RequirementWorkspacePageProps) {
  const { id } = await params;
  const requirementId = Number(id);

  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    notFound();
  }

  const [requirement, applications, evaluations, interviews, interviewers] =
    await Promise.all([
      getJobById(requirementId),
      getApplicationsByJobId(requirementId),
      getEvaluationsByJobId(requirementId),
      getInterviewsByJobId(requirementId),
      getInterviewers(),
    ]);

  if (!requirement) {
    notFound();
  }

  return (
    <RequirementWorkspaceClient
      requirement={requirement}
      applications={applications}
      evaluations={evaluations}
      interviews={interviews}
      interviewers={interviewers}
    />
  );
}
