"use client";

import { useState } from "react";
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
  type ClientPipelineCounts,
} from "@/components/client/client-labels";
import ClientRequirementCandidates from "@/components/client/ClientRequirementCandidates";
import ClientRequirementNav from "@/components/client/ClientRequirementNav";
import JobDistributionPanel from "@/components/client/JobDistributionPanel";
import type { ClientCandidateCardData } from "@/components/client/ClientCandidateCard";
import type { SafeProviderConnection } from "@/lib/jobs/distribution/connection-service";
import type { SafeJobDistribution } from "@/lib/jobs/distribution/distribution-service";

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
  specificationUpdatedAt: string | null;
  hasDraftSpecification: boolean;
  hasPublishedSpecification: boolean;
  aiProposedJobDescription: string | null;
  aiGenerationStatus: JobDescriptionAiGenerationStatus | null;
  clientCompletedAt: string | null;
  applicationCount: number;
  pipelineCounts: ClientPipelineCounts;
};

type ClientRequirementWorkspaceProps = {
  requirement: ClientRequirementWorkspaceData;
  candidates: ClientCandidateCardData[];
  shortlistedCount: number;
  initialSection?: "overview" | "candidates";
  isOwner: boolean;
  connections: SafeProviderConnection[];
  distributions: SafeJobDistribution[];
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

export default function ClientRequirementWorkspace({
  requirement,
  candidates,
  shortlistedCount,
  initialSection = "overview",
  isOwner,
  connections,
  distributions,
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
            <h2 className="text-lg font-bold text-black">Role / Requirement</h2>
            <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-black">Role Category</dt>
                <dd>
                  {requirement.roleCategory
                    ? roleCategoryLabels[requirement.roleCategory]
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Experience</dt>
                <dd>{displayValue(requirement.experienceRange)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Location</dt>
                <dd>{displayValue(requirement.location)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Compensation</dt>
                <dd>{displayValue(requirement.compensationRange)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Number of Positions</dt>
                <dd>{displayValue(requirement.numberOfPositions)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Target Hire Date</dt>
                <dd>
                  {formatClientDate(
                    requirement.targetHireDate
                      ? new Date(requirement.targetHireDate)
                      : null,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Requirements</h2>
            <dl className="mt-4 grid gap-4 text-sm text-zinc-600">
              <div>
                <dt className="font-medium text-black">Primary Skills</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.primarySkills)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Must Have</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.mustHaveRequirements)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Nice To Have</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.niceToHaveRequirements)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Job Description</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.jobDescription)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Evaluation Criteria</dt>
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
