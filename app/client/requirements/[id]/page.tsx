import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Requirement",
};

import { notFound } from "next/navigation";
import Link from "next/link";

import type { ClientCandidateCardData } from "@/components/client/ClientCandidateCard";
import ClientRequirementWorkspace from "@/components/client/ClientRequirementWorkspace";
import { listProviderConnectionsForCompany } from "@/lib/jobs/distribution/connection-service";
import { listJobDistributionsForJob } from "@/lib/jobs/distribution/distribution-service";
import {
  countPipelineStatuses,
  getClientTechnicalEvaluationStatus,
  selectPrimaryClientEvaluation,
} from "@/components/client/client-labels";
import { describeEmailDeliveryOutcome } from "@/lib/communication/email-delivery-status";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientApplicationsForRequirement } from "@/lib/repositories/application-repository";
import { getJobById } from "@/lib/repositories/job-repository";
import { getAssessmentLeaderboardForJob } from "@/lib/assessments/assessment-service";
import { getRequirementHiringDesk } from "@/lib/hiring/requirement-desk";
import { prisma } from "@/lib/prisma";

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
  const client = await requireClientPortal();

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  // Ignore tenant query params — company comes from the session User only.
  const sectionParam = resolvedSearchParams.section;
  const initialSection =
    sectionParam === "candidates" ? "candidates" : "overview";

  const requirementId = Number(id);

  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    notFound();
  }

  const requirement = await getJobById(requirementId);

  if (!requirement) {
    notFound();
  }

  const [applications, connections, distributions, assessmentLeaderboard, hiringDesk] =
    await Promise.all([
      getClientApplicationsForRequirement(requirementId),
      listProviderConnectionsForCompany(client.companyId),
      listJobDistributionsForJob({
        jobId: requirementId,
        companyId: client.companyId,
      }),
      getAssessmentLeaderboardForJob(requirementId, {
        audience: "hiring",
      }).catch(() => null),
      getRequirementHiringDesk(requirementId),
    ]);

  const pipelineCounts = countPipelineStatuses(
    applications.map((application) => application.status),
  );

  const shortlistedCount = applications.filter(
    (application) => application.status === "SHORTLISTED",
  ).length;

  const candidates: ClientCandidateCardData[] = applications.map(
    (application) => {
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
        status: application.status,
        expertScore: application.expertScore,
        technicalEvaluationStatus:
          getClientTechnicalEvaluationStatus(evaluation),
        recommendation: evaluation?.recommendation ?? null,
        fitDecision: evaluation?.fitDecision ?? null,
        emailDeliveryNote:
          [
            describeEmailDeliveryOutcome(application.candidateStageEmailStatus),
            describeEmailDeliveryOutcome(application.interviews[0]?.bookingEmailStatus),
          ]
            .filter(Boolean)
            .join(" ") || null,
      };
    },
  );

  const requirementRows = await prisma.jobRequirement.findMany({
    where: { jobId: requirementId, companyId: client.companyId },
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      sourceText: true,
      requirementType: true,
      evidenceType: true,
      approvalStatus: true,
    },
  });

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
        key={`${requirement.id}-${requirement.requirementLifecycle}-${requirement.updatedAt.toISOString()}-${requirement.specificationUpdatedAt?.toISOString() ?? "none"}-${initialSection}`}
        requirement={{
          id: requirement.id,
          title: requirement.title,
          companyName: requirement.company.name,
          companyPublicSlug: requirement.company.publicSlug,
          companyIndustry: requirement.company.industry,
          companyEmployees: requirement.company.employees,
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
          structuredPayload: requirement.structuredPayload,
          createdAt: requirement.createdAt.toISOString(),
          specificationUpdatedAt: requirement.specificationUpdatedAt
            ? requirement.specificationUpdatedAt.toISOString()
            : null,
          hasDraftSpecification: requirement.hasDraftSpecification,
          hasPublishedSpecification: requirement.hasPublishedSpecification,
          aiProposedJobDescription: requirement.aiProposedJobDescription,
          aiGenerationStatus: requirement.aiGenerationStatus,
          clientCompletedAt: requirement.clientCompletedAt
            ? requirement.clientCompletedAt.toISOString()
            : null,
          applicationCount: applications.length,
          pipelineCounts,
          assignedInterviewer: requirement.assignedInterviewer
            ? {
                id: requirement.assignedInterviewer.id,
                name: requirement.assignedInterviewer.name,
              }
            : null,
        }}
        candidates={candidates}
        shortlistedCount={shortlistedCount}
        initialSection={initialSection}
        isOwner={client.membershipRole === "OWNER"}
        connections={connections}
        distributions={distributions}
        assessmentLeaderboard={assessmentLeaderboard}
        hiringDesk={hiringDesk}
        requirementRows={requirementRows}
      />
    </div>
  );
}
