"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  JobDescriptionAiGenerationStatus,
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

import {
  clientJobStatusLabels,
  clientRequirementLifecycleLabels,
  formatClientDate,
  formatRelativePosted,
  type ClientPipelineCounts,
} from "@/components/client/client-labels";
import ClientRequirementCandidates from "@/components/client/ClientRequirementCandidates";
import ClientRequirementNav from "@/components/client/ClientRequirementNav";
import JobDistributionPanel from "@/components/client/JobDistributionPanel";
import type { ClientCandidateCardData } from "@/components/client/ClientCandidateCard";
import JobPostingDetail from "@/components/jobs/JobPostingDetail";
import type { SafeProviderConnection } from "@/lib/jobs/distribution/connection-service";
import type { SafeJobDistribution } from "@/lib/jobs/distribution/distribution-service";
import type { AssessmentLeaderboardPage } from "@/lib/assessments/assessment-service";
import AssessmentLeaderboardPanel from "@/components/assess/AssessmentLeaderboardPanel";
import { resolveJobPostingView } from "@/lib/jobs/job-posting-view";

const roleCategoryLabels: Record<RoleCategory, string> = {
  ENGINEERING: "Engineering",
  SALES: "Sales",
  DESIGN: "Design",
  FINANCE: "Finance",
};

export type ClientRequirementWorkspaceData = {
  id: number;
  title: string;
  companyName: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  location: string | null;
  compensationRange: string | null;
  targetHireDate: string | null;
  numberOfPositions: number | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  jobDescription: string | null;
  evaluationCriteria: string | null;
  primarySkills: string | null;
  structuredPayload?: unknown;
  companyIndustry?: string | null;
  companyEmployees?: number | null;
  createdAt: string;
  specificationUpdatedAt: string | null;
  hasDraftSpecification: boolean;
  hasPublishedSpecification: boolean;
  aiProposedJobDescription: string | null;
  aiGenerationStatus: JobDescriptionAiGenerationStatus | null;
  clientCompletedAt: string | null;
  applicationCount: number;
  pipelineCounts: ClientPipelineCounts;
  assignedInterviewer?: {
    id: number;
    name: string;
  } | null;
};

type ClientRequirementWorkspaceProps = {
  requirement: ClientRequirementWorkspaceData;
  candidates: ClientCandidateCardData[];
  shortlistedCount: number;
  initialSection?: "overview" | "candidates";
  isOwner: boolean;
  connections: SafeProviderConnection[];
  distributions: SafeJobDistribution[];
  assessmentLeaderboard?: AssessmentLeaderboardPage | null;
};

function lifecycleGuidance(lifecycle: RequirementLifecycle) {
  switch (lifecycle) {
    case "REQUIREMENT_POSTED":
      return "This role is posted. HireIQ will assign an interviewer next.";
    case "INTERVIEWER_NOTIFIED":
      return "The assigned interviewer has been notified.";
    case "SOURCING_SHORTLISTING":
      return "Sourcing and shortlisting are in progress.";
    case "BILLING_GENERATED":
      return "Billing has been generated for this requirement.";
    default:
      return "This requirement is posted and can no longer be edited.";
  }
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return String(value);
}

function postingView(requirement: ClientRequirementWorkspaceData) {
  return resolveJobPostingView(
    {
      title: requirement.title,
      companyName: requirement.companyName,
      companyIndustry: requirement.companyIndustry,
      companyEmployees: requirement.companyEmployees,
      location: requirement.location,
      experienceRange: requirement.experienceRange,
      numberOfPositions: requirement.numberOfPositions,
      compensationRange: requirement.compensationRange,
      jobDescription: requirement.jobDescription,
      mustHaveRequirements: requirement.mustHaveRequirements,
      niceToHaveRequirements: requirement.niceToHaveRequirements,
      primarySkills: requirement.primarySkills,
      structuredPayload: requirement.structuredPayload,
    },
    formatRelativePosted(requirement.createdAt),
  );
}

export default function ClientRequirementWorkspace({
  requirement,
  candidates,
  shortlistedCount,
  initialSection = "overview",
  isOwner,
  connections,
  distributions,
  assessmentLeaderboard,
}: ClientRequirementWorkspaceProps) {
  const [section, setSection] = useState<"overview" | "candidates">(
    initialSection,
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Requirement Workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">
            {requirement.title}
          </h1>
          <p className="mt-2 text-zinc-600">{requirement.companyName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Status: {clientJobStatusLabels[requirement.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Lifecycle:{" "}
            {
              clientRequirementLifecycleLabels[
                requirement.requirementLifecycle
              ]
            }
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        {lifecycleGuidance(requirement.requirementLifecycle)}
        {requirement.clientCompletedAt ? (
          <span className="ml-2 text-zinc-500">
            Posted {formatClientDate(new Date(requirement.clientCompletedAt))}
          </span>
        ) : null}
      </div>

      <ClientRequirementNav
        requirementId={requirement.id}
        candidateCount={candidates.length}
        shortlistedCount={shortlistedCount}
        active={section}
        onSelectSection={setSection}
      />

      {section === "candidates" ? (
        <ClientRequirementCandidates
          requirementId={requirement.id}
          candidates={candidates}
        />
      ) : (
        <>
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <JobPostingDetail
              view={postingView(requirement)}
              showHeader={false}
            />
          </section>

          {requirement.assignedInterviewer ? (
            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-bold text-black">Interviewer</h2>
              <p className="mt-2 text-sm text-zinc-600">
                {requirement.assignedInterviewer.name} is assigned to this
                requirement. Open their profile to see background, experience,
                and public proof of work.
              </p>
              <Link
                href={`/client/interviewers/${requirement.assignedInterviewer.id}`}
                className="mt-4 inline-flex rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                View interviewer profile
              </Link>
            </section>
          ) : null}

          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Hiring process</h2>
            <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-black">Role category</dt>
                <dd>
                  {requirement.roleCategory
                    ? roleCategoryLabels[requirement.roleCategory]
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Target hire date</dt>
                <dd>
                  {formatClientDate(
                    requirement.targetHireDate
                      ? new Date(requirement.targetHireDate)
                      : null,
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-black">Evaluation criteria</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.evaluationCriteria)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Client Action</h2>
            <p className="mt-2 text-sm text-zinc-600">
              This requirement is posted and can no longer be edited.
            </p>
          </section>

          <JobDistributionPanel
            jobId={requirement.id}
            hasPublishedSpecification={requirement.hasPublishedSpecification}
            isOwner={isOwner}
            connections={connections}
            distributions={distributions}
          />

          {assessmentLeaderboard ? (
            <AssessmentLeaderboardPanel board={assessmentLeaderboard} />
          ) : null}

          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Pipeline summary</h2>
            {requirement.applicationCount === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">
                No candidates are currently in the recruitment pipeline.
              </p>
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-zinc-600 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <dt className="font-medium text-black">CV Pool</dt>
                  <dd className="mt-1 text-2xl font-bold text-black">
                    {requirement.pipelineCounts.cvPool}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Expert Review</dt>
                  <dd className="mt-1 text-2xl font-bold text-black">
                    {requirement.pipelineCounts.expertReview}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Tech Eval</dt>
                  <dd className="mt-1 text-2xl font-bold text-black">
                    {requirement.pipelineCounts.techEvaluation}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Shortlisted</dt>
                  <dd className="mt-1 text-2xl font-bold text-black">
                    {requirement.pipelineCounts.shortlisted}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Selected</dt>
                  <dd className="mt-1 text-2xl font-bold text-black">
                    {requirement.pipelineCounts.selected}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Hired</dt>
                  <dd className="mt-1 text-2xl font-bold text-black">
                    {requirement.pipelineCounts.hired}
                  </dd>
                </div>
              </dl>
            )}
          </section>
        </>
      )}
    </div>
  );
}
