import { notFound } from "next/navigation";

import RequirementWorkspaceClient from "@/components/requirements/RequirementWorkspaceClient";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/authorization";
import { getJobEvidenceCapture } from "@/lib/candidates/evidence-capture/evidence-capture-service";
import { getJobRanking } from "@/lib/candidates/ranking/ranking-service";
import { getAssessmentLeaderboardForJob } from "@/lib/assessments/assessment-service";
import { getApplicationsByJobId } from "@/lib/repositories/application-repository";
import { getBillingForRequirement } from "@/lib/repositories/billing-repository";
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

  const [
    requirement,
    applications,
    evaluations,
    interviews,
    interviewers,
    billingRecords,
  ] = await Promise.all([
    getJobById(requirementId),
    getApplicationsByJobId(requirementId),
    getEvaluationsByJobId(requirementId),
    getInterviewsByJobId(requirementId),
    getInterviewers(),
    getBillingForRequirement(requirementId),
  ]);

  if (!requirement) {
    notFound();
  }

  let ranking = null;
  try {
    ranking = await getJobRanking(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      ranking = null;
    } else {
      throw error;
    }
  }

  let evidenceCapture = null;
  try {
    evidenceCapture = await getJobEvidenceCapture(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      evidenceCapture = null;
    } else {
      throw error;
    }
  }

  let assessmentLeaderboard = null;
  try {
    assessmentLeaderboard =
      await getAssessmentLeaderboardForJob(requirementId);
  } catch {
    assessmentLeaderboard = null;
  }

  return (
    <RequirementWorkspaceClient
      requirement={requirement}
      applications={applications}
      evaluations={evaluations}
      interviews={interviews}
      interviewers={interviewers}
      billingRecords={billingRecords}
      ranking={ranking}
      evidenceCapture={evidenceCapture}
      assessmentLeaderboard={assessmentLeaderboard}
    />
  );
}
