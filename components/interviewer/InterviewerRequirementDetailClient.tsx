"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  ApplicationPipelineStatus,
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

import {
  clientJobStatusLabels,
  clientPipelineStatusLabels,
  clientRequirementLifecycleLabels,
  formatClientDate,
  formatClientOptional,
  getClientPipelineStatusLabel,
  getClientSourceLabel,
} from "@/components/client/client-labels";
import { completeJobShortlisting } from "@/app/actions/job-actions";
import { describeUnsentCommunicationEmail } from "@/lib/communication/email-follow-up";
import InterviewerShortlistActions from "@/components/interviewer/InterviewerShortlistActions";

type InterviewerCandidate = {
  id: number;
  status: ApplicationPipelineStatus;
  source: string | null;
  expertScore: number | null;
  candidate: {
    name: string;
    role: string;
    experienceYears: number;
    location: string | null;
    currentEmployer: string | null;
    skills: string | null;
    expectedCTC: string | null;
  };
  evaluations: Array<{
    id: number;
    evaluatedAt: Date | null;
  }>;
};

type InterviewerRequirementDetailClientProps = {
  requirement: {
    id: number;
    title: string;
    status: JobStatus;
    roleCategory: RoleCategory | null;
    experienceRange: string | null;
    location: string | null;
    compensationRange: string | null;
    targetHireDate: Date | null;
    numberOfPositions: number | null;
    mustHaveRequirements: string | null;
    niceToHaveRequirements: string | null;
    jobDescription: string | null;
    evaluationCriteria: string | null;
    primarySkills: string | null;
    requirementLifecycle: RequirementLifecycle;
    sourcingAccessReceivedAt: Date | null;
    shortlistingCompletedAt: Date | null;
    company: { name: string };
  };
  candidates: InterviewerCandidate[];
};

const PIPELINE_FILTERS: Array<ApplicationPipelineStatus | "ALL"> = [
  "ALL",
  "CV_POOL",
  "EXPERT_REVIEW",
  "TECH_EVALUATION",
  "SHORTLISTED",
  "SELECTED",
  "HIRED",
  "REJECTED",
];

function evaluationStatusLabel(candidate: InterviewerCandidate) {
  const evaluation = candidate.evaluations[0];
  if (!evaluation) return "Not started";
  if (evaluation.evaluatedAt) return "Completed";
  return "In progress";
}

export default function InterviewerRequirementDetailClient({
  requirement,
  candidates,
}: InterviewerRequirementDetailClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ApplicationPipelineStatus | "ALL"
  >("ALL");
  const [isCompletingShortlist, setIsCompletingShortlist] = useState(false);
  const [shortlistingCompletedAt, setShortlistingCompletedAt] = useState(
    requirement.shortlistingCompletedAt,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const availableStatuses = useMemo(() => {
    const present = new Set(candidates.map((candidate) => candidate.status));
    return PIPELINE_FILTERS.filter(
      (status) => status === "ALL" || present.has(status),
    );
  }, [candidates]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return candidates.filter((application) => {
      if (statusFilter !== "ALL" && application.status !== statusFilter) {
        return false;
      }

      if (!normalized) return true;

      const haystack = [
        application.candidate.name,
        application.candidate.role,
        application.candidate.currentEmployer,
        application.candidate.location,
        application.candidate.skills,
        getClientPipelineStatusLabel(application.status),
        getClientSourceLabel(application.source),
        evaluationStatusLabel(application),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [candidates, search, statusFilter]);

  const shortlistedCount = candidates.filter(
    (candidate) => candidate.status === "SHORTLISTED",
  ).length;

  const canCompleteShortlisting =
    requirement.requirementLifecycle === "SOURCING_SHORTLISTING" &&
    Boolean(requirement.sourcingAccessReceivedAt) &&
    !shortlistingCompletedAt;

  async function handleCompleteShortlisting() {
    setActionError(null);
    setActionNotice(null);
    setIsCompletingShortlist(true);

    try {
      const result = await completeJobShortlisting(requirement.id);
      setShortlistingCompletedAt(result.job.shortlistingCompletedAt);
      const notice = describeUnsentCommunicationEmail(result.email, "T70");
      if (notice) setActionNotice(notice);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Shortlisting could not be completed.",
      );
    } finally {
      setIsCompletingShortlist(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/interviewer/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Assigned requirement
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          {requirement.title}
        </h1>
        <p className="mt-2 text-zinc-600">{requirement.company.name}</p>
        <div className="mt-4 flex flex-wrap gap-2">
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
        {canCompleteShortlisting ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-zinc-600">
              Shortlisted: {shortlistedCount}
            </p>
            <button
              type="button"
              disabled={isCompletingShortlist || shortlistedCount < 1}
              onClick={() => void handleCompleteShortlisting()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {isCompletingShortlist ? "Completing..." : "Complete Shortlisting"}
            </button>
            {shortlistedCount < 1 ? (
              <p className="mt-2 text-sm text-zinc-600">
                Shortlist at least one candidate before completing.
              </p>
            ) : null}
            {actionError ? (
              <p className="mt-2 text-sm text-red-700">{actionError}</p>
            ) : null}
            {actionNotice ? (
              <p className="mt-2 text-sm text-amber-800">{actionNotice}</p>
            ) : null}
          </div>
        ) : null}
        {shortlistingCompletedAt ? (
          <p className="mt-3 text-sm text-zinc-600">
            Shortlist completed. The client can now review recommended candidates.
          </p>
        ) : null}
      </div>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Requirement Overview</h2>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-medium text-black">Role</dt>
            <dd>{requirement.roleCategory || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd>{requirement.location || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Experience</dt>
            <dd>{requirement.experienceRange || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Compensation</dt>
            <dd>{requirement.compensationRange || "Not set"}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Target hire date</dt>
            <dd>{formatClientDate(requirement.targetHireDate)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Positions</dt>
            <dd>{formatClientOptional(requirement.numberOfPositions)}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="font-medium text-black">Primary skills</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {requirement.primarySkills || "Not set"}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="font-medium text-black">Must-have requirements</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {requirement.mustHaveRequirements || "Not set"}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="font-medium text-black">Nice-to-have requirements</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {requirement.niceToHaveRequirements || "Not set"}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="font-medium text-black">Evaluation criteria</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {requirement.evaluationCriteria || "Not set"}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="font-medium text-black">Job description</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {requirement.jobDescription || "Not set"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-black">Candidates</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Applications for this assigned requirement. Shortlisted:{" "}
              {shortlistedCount}
            </p>
          </div>
          <p className="text-sm text-zinc-600">
            {filtered.length} of {candidates.length}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-4 lg:flex-row">
          <label htmlFor="interviewer-candidate-search" className="sr-only">
            Search candidates
          </label>
          <input
            id="interviewer-candidate-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, role, employer, location, skills..."
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black lg:max-w-xl"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {availableStatuses.map((status) => {
            const isActive = statusFilter === status;
            const label =
              status === "ALL" ? "All" : clientPipelineStatusLabels[status];

            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-black text-white"
                    : "border border-zinc-300 bg-white text-black hover:bg-zinc-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {candidates.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
            <p className="text-lg font-medium text-black">
              No candidates for this requirement yet.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
            <p className="text-lg font-medium text-black">
              No candidates match your filters.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {filtered.map((application) => (
              <article
                key={application.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-black">
                      {application.candidate.name}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600">
                      {application.candidate.role}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                      {getClientPipelineStatusLabel(application.status)}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                      {evaluationStatusLabel(application)}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="font-medium text-black">Experience</dt>
                    <dd>{application.candidate.experienceYears} years</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Location</dt>
                    <dd>
                      {formatClientOptional(application.candidate.location)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Current employer</dt>
                    <dd>
                      {formatClientOptional(
                        application.candidate.currentEmployer,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Expected CTC</dt>
                    <dd>
                      {formatClientOptional(application.candidate.expectedCTC)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Source</dt>
                    <dd>{getClientSourceLabel(application.source)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Expert score</dt>
                    <dd>{formatClientOptional(application.expertScore)}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="font-medium text-black">Skills</dt>
                    <dd>
                      {formatClientOptional(application.candidate.skills)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <Link
                    href={`/interviewer/requirements/${requirement.id}/candidates/${application.id}`}
                    className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Open Candidate
                  </Link>
                  <InterviewerShortlistActions
                    applicationId={application.id}
                    status={application.status}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
