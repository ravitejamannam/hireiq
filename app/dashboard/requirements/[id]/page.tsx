import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Requirement",
};

import { notFound } from "next/navigation";

import RequirementWorkspaceClient from "@/components/requirements/RequirementWorkspaceClient";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/authorization";
import { getJobEvidenceCapture } from "@/lib/candidates/evidence-capture/evidence-capture-service";
import { MatcherV2Error } from "@/lib/candidates/matching/matching-v2-errors";
import { getRequirementExplanation } from "@/lib/candidates/matching/matching-v2-service";
import { LexicalRetrievalError } from "@/lib/retrieval/lexical-retrieval-errors";
import { getLexicalRetrieval } from "@/lib/retrieval/lexical-retrieval-service";
import { EvidenceGraphError } from "@/lib/evidence-graph/evidence-graph-errors";
import { getEvidenceGraph } from "@/lib/evidence-graph/evidence-graph-service";
import { HybridRetrievalError } from "@/lib/retrieval/hybrid-retrieval-errors";
import { getHybridRetrieval } from "@/lib/retrieval/hybrid-retrieval-service";
import { SemanticRetrievalError } from "@/lib/retrieval/semantic-retrieval-errors";
import { getSemanticRetrieval } from "@/lib/retrieval/semantic-retrieval-service";
import { getJobRanking } from "@/lib/candidates/ranking/ranking-service";
import { getAssessmentLeaderboardForJob } from "@/lib/assessments/assessment-service";
import { getRequirementHiringDesk } from "@/lib/hiring/requirement-desk";
import { getApplicationsByJobId } from "@/lib/repositories/application-repository";
import { getBillingForRequirement } from "@/lib/repositories/billing-repository";
import { getEvaluationsByJobId } from "@/lib/repositories/evaluation-repository";
import { getInterviewsByJobId } from "@/lib/repositories/interview-repository";
import { getInterviewers } from "@/lib/repositories/interviewer-repository";
import { getJobById } from "@/lib/repositories/job-repository";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { prisma } from "@/lib/prisma";
import { publicHostedDistributionWhere } from "@/lib/jobs/public-feed/public-feed-service";

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
    hiringDesk,
  ] = await Promise.all([
    getJobById(requirementId),
    getApplicationsByJobId(requirementId),
    getEvaluationsByJobId(requirementId),
    getInterviewsByJobId(requirementId),
    getInterviewers(),
    getBillingForRequirement(requirementId),
    getRequirementHiringDesk(requirementId),
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

  let explanation = null;
  try {
    explanation = await getRequirementExplanation(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof MatcherV2Error
    ) {
      explanation = null;
    } else {
      throw error;
    }
  }

  let retrieval = null;
  try {
    retrieval = await getLexicalRetrieval(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof LexicalRetrievalError
    ) {
      retrieval = null;
    } else {
      throw error;
    }
  }

  let semanticRetrieval = null;
  try {
    semanticRetrieval = await getSemanticRetrieval(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof SemanticRetrievalError
    ) {
      semanticRetrieval = null;
    } else {
      throw error;
    }
  }

  let hybridRetrieval = null;
  try {
    hybridRetrieval = await getHybridRetrieval(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof HybridRetrievalError
    ) {
      hybridRetrieval = null;
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

  let evidenceGraph = null;
  try {
    evidenceGraph = await getEvidenceGraph(requirementId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof EvidenceGraphError
    ) {
      evidenceGraph = null;
    } else {
      throw error;
    }
  }

  let assessmentLeaderboard = null;
  try {
    assessmentLeaderboard =
      await getAssessmentLeaderboardForJob(requirementId, {
        audience: "hiring",
      });
  } catch {
    assessmentLeaderboard = null;
  }

  // T127: distribution kit context (apply token + first board distribution)
  const distributionRow = await prisma.jobDistribution.findFirst({
    where: {
      jobId: requirementId,
      ...publicHostedDistributionWhere(),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      applyUrlSnapshot: true,
    },
  });
  const applyUrl = distributionRow?.applyUrlSnapshot ?? null;

  return (
    <RequirementWorkspaceClient
      requirement={requirement}
      applications={applications}
      evaluations={evaluations}
      interviews={interviews}
      interviewers={interviewers}
      billingRecords={billingRecords}
      ranking={ranking}
      explanation={explanation}
      retrieval={retrieval}
      semanticRetrieval={semanticRetrieval}
      hybridRetrieval={hybridRetrieval}
      evidenceGraph={evidenceGraph}
      evidenceCapture={evidenceCapture}
      assessmentLeaderboard={assessmentLeaderboard}
      hiringDesk={hiringDesk}
      applyUrl={applyUrl}
      distributionId={distributionRow?.id ?? null}
      companyId={requirement.companyId}
      publicOrigin={getPublicAppUrl() ?? ""}
    />
  );
}
