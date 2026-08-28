"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApplicationPipelineStatus } from "@prisma/client";

import {
  assignInterviewerToJob,
  completeJobShortlisting,
  markJobSourcingAccessReceived,
  notifyAssignedInterviewer,
} from "@/app/actions/job-actions";
import { transitionApplicationStatus } from "@/app/actions/application-actions";
import { getAdminHiringMonitorNote } from "@/components/applications/admin-hiring-notes";
import { getApplicationPipelineStatusLabel } from "@/components/applications/ApplicationForm";
import { describeUnsentCommunicationEmail } from "@/lib/communication/email-follow-up";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  getFitDecisionLabel,
  getRecommendationLabel,
} from "@/components/evaluations/EvaluationForm";
import {
  formatJobDateTime,
  getSlaStatus,
  getSourcingDatabaseLabel,
  requirementLifecycleLabels,
} from "@/components/jobs/JobCard";
import BillingRecordsPanel, {
  type BillingRecordView,
} from "@/components/billing/BillingRecordsPanel";
import PipelineCard from "@/components/pipeline/PipelineCard";
import DistributionKit from "@/components/requirements/DistributionKit";
import SourcedCandidateForm from "@/components/requirements/SourcedCandidateForm";
import MintOfferLinkButton from "@/components/offers/MintOfferLinkButton";
import JobEvidenceCapturePanel from "@/components/requirements/JobEvidenceCapturePanel";
import JobRankingPanel from "@/components/requirements/JobRankingPanel";
import AssessmentLeaderboardPanel from "@/components/assess/AssessmentLeaderboardPanel";
import type { JobEvidenceCapturePageData } from "@/lib/candidates/evidence-capture/evidence-capture-types";
import type { JobRankingPageData } from "@/lib/candidates/ranking/ranking-types";
import type { AssessmentLeaderboardPage } from "@/lib/assessments/assessment-service";
import type { getApplicationsByJobId } from "@/lib/repositories/application-repository";
import type { getEvaluationsByJobId } from "@/lib/repositories/evaluation-repository";
import type { getInterviewsByJobId } from "@/lib/repositories/interview-repository";
import type { getInterviewers } from "@/lib/repositories/interviewer-repository";
import type { getJobById } from "@/lib/repositories/job-repository";
import { isInterviewerAssignmentLocked } from "@/lib/jobs/interviewer-assignment-lock";
import { ADMIN_PIPELINE_TRANSITIONS } from "@/lib/validation/application-pipeline";

type Requirement = NonNullable<Awaited<ReturnType<typeof getJobById>>>;
type Application = Awaited<ReturnType<typeof getApplicationsByJobId>>[number];
type Evaluation = Awaited<ReturnType<typeof getEvaluationsByJobId>>[number];
type Interview = Awaited<ReturnType<typeof getInterviewsByJobId>>[number];
type Interviewer = Awaited<ReturnType<typeof getInterviewers>>[number];

type WorkspaceTab =
  | "overview"
  | "candidates"
  | "pipeline"
  | "evaluations"
  | "interviews"
  | "activity"
  | "billing";

type PipelineFilter = "ALL" | ApplicationPipelineStatus;

type RequirementWorkspaceClientProps = {
  requirement: Requirement;
  applications: Application[];
  evaluations: Evaluation[];
  interviews: Interview[];
  interviewers: Interviewer[];
  billingRecords: BillingRecordView[];
  ranking?: JobRankingPageData | null;
  evidenceCapture?: JobEvidenceCapturePageData | null;
  assessmentLeaderboard?: AssessmentLeaderboardPage | null;
  applyUrl?: string | null;
  distributionId?: number | null;
  companyId?: number;
};

const PIPELINE_STAGES: ApplicationPipelineStatus[] = [
  ApplicationPipelineStatus.CV_POOL,
  ApplicationPipelineStatus.EXPERT_REVIEW,
  ApplicationPipelineStatus.TECH_EVALUATION,
  ApplicationPipelineStatus.SHORTLISTED,
  ApplicationPipelineStatus.SELECTED,
  ApplicationPipelineStatus.HIRED,
  ApplicationPipelineStatus.REJECTED,
];

const APPLICATION_STATUS_TRANSITIONS = ADMIN_PIPELINE_TRANSITIONS;

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "candidates", label: "Candidates" },
  { id: "pipeline", label: "Pipeline" },
  { id: "evaluations", label: "Evaluations" },
  { id: "interviews", label: "Interviews" },
  { id: "activity", label: "Activity" },
  { id: "billing", label: "Billing" },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function getMoveLabel(status: ApplicationPipelineStatus) {
  if (status === ApplicationPipelineStatus.REJECTED) {
    return "Reject";
  }

  return `Move to ${getApplicationPipelineStatusLabel(status)}`;
}

function getMonitorNote(status: ApplicationPipelineStatus) {
  return getAdminHiringMonitorNote(status);
}

function countByStatus(
  applications: Application[],
  status: ApplicationPipelineStatus,
) {
  return applications.filter((application) => application.status === status)
    .length;
}

export default function RequirementWorkspaceClient({
  requirement,
  applications,
  evaluations,
  interviews,
  interviewers,
  billingRecords,
  ranking,
  evidenceCapture,
  assessmentLeaderboard,
  applyUrl,
  distributionId,
  companyId,
}: RequirementWorkspaceClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>("ALL");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [movingApplicationId, setMovingApplicationId] = useState<number | null>(
    null,
  );
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLifecycleBusy, setIsLifecycleBusy] = useState(false);

  const slaStatus = getSlaStatus({
    shortlistingCompletedAt: requirement.shortlistingCompletedAt,
    shortlistingDueAt: requirement.shortlistingDueAt,
  });
  const assignmentLocked = isInterviewerAssignmentLocked(
    requirement.requirementLifecycle,
  );

  const stageCounts = useMemo(() => {
    return Object.fromEntries(
      PIPELINE_STAGES.map((status) => [
        status,
        countByStatus(applications, status),
      ]),
    ) as Record<ApplicationPipelineStatus, number>;
  }, [applications]);

  const filteredApplications = applications.filter((application) => {
    if (pipelineFilter === "ALL") return true;
    return application.status === pipelineFilter;
  });

  async function handleMove(
    id: number,
    nextStatus: ApplicationPipelineStatus,
  ) {
    setActionError("");
    setMovingApplicationId(id);

    try {
      await transitionApplicationStatus(id, nextStatus);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setMovingApplicationId(null);
    }
  }

  async function handleAssignInterviewer(interviewerId: number | null) {
    setActionError("");
    setIsAssigning(true);

    try {
      await assignInterviewerToJob(requirement.id, interviewerId);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsAssigning(false);
    }
  }

  async function runLifecycleAction(
    action: () => Promise<unknown>,
    emailEvent?: "T68" | "T69" | "T70",
  ) {
    setActionError("");
    setActionNotice("");
    setIsLifecycleBusy(true);

    try {
      const result = await action();
      if (
        emailEvent &&
        result &&
        typeof result === "object" &&
        "email" in result
      ) {
        const notice = describeUnsentCommunicationEmail(
          (result as { email: Parameters<typeof describeUnsentCommunicationEmail>[0] }).email,
          emailEvent,
        );
        if (notice) setActionNotice(notice);
      }
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsLifecycleBusy(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link
          href="/dashboard/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Requirement Workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">
            {requirement.title}
          </h1>
          <p className="mt-1 text-lg text-zinc-600">{requirement.company.name}</p>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            <div>
              <dt className="inline font-medium text-black">Lifecycle: </dt>
              <dd className="inline">
                {requirementLifecycleLabels[requirement.requirementLifecycle]}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-black">
                Assigned Interviewer:{" "}
              </dt>
              <dd className="inline">
                {requirement.assignedInterviewer ? (
                  <Link
                    href={`/dashboard/interviewers/${requirement.assignedInterviewer.id}`}
                    className="font-medium text-zinc-900 underline underline-offset-2 hover:text-black"
                  >
                    {requirement.assignedInterviewer.name}
                  </Link>
                ) : (
                  "Not assigned"
                )}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-black">SLA: </dt>
              <dd className="inline">
                {slaStatus === "OVERDUE"
                  ? "At risk"
                  : slaStatus === "COMPLETED"
                    ? "Completed"
                    : slaStatus === "ACTIVE"
                      ? "Active"
                      : "Not started"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2">
          {requirement.assignedInterviewer ? (
            <Link
              href={`/dashboard/interviewers/${requirement.assignedInterviewer.id}`}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              View interviewer profile
            </Link>
          ) : null}
          <Link
            href={`/dashboard/sourcing?requirementId=${requirement.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Sourcing
          </Link>
          <Link
            href={`/dashboard/expert-review?requirementId=${requirement.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Expert Review
          </Link>
          <Link
            href={`/dashboard/technical-evaluations?requirementId=${requirement.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Technical Evaluation
          </Link>
          <Link
            href={`/dashboard/requirements/${requirement.id}/blueprint`}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Interview Blueprint
          </Link>
          <Link
            href={`/dashboard/shortlist?requirementId=${requirement.id}`}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Shortlist
          </Link>
        </div>
      </div>

      {evidenceCapture ? (
        <JobEvidenceCapturePanel
          capture={evidenceCapture}
          applicationLabels={applications.map((application) => ({
            id: application.id,
            label: `${application.candidate.name} (Application #${application.id})`,
          }))}
        />
      ) : null}

      {ranking ? (
        <JobRankingPanel
          ranking={ranking}
          applicationLabels={applications.map((application) => ({
            id: application.id,
            label: `${application.candidate.name} (Application #${application.id})`,
          }))}
        />
      ) : null}

      {assessmentLeaderboard ? (
        <AssessmentLeaderboardPanel board={assessmentLeaderboard} />
      ) : null}

      <div
        className="mt-8 flex flex-wrap gap-2 border-b border-zinc-200 pb-3"
        role="tablist"
        aria-label="Requirement workspace sections"
      >
        {WORKSPACE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-black text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {actionError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      {actionNotice && (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {actionNotice}
        </p>
      )}

      {activeTab === "overview" && (
        <div className="mt-8 space-y-8">
          <DistributionKit
            jobTitle={requirement.title}
            applyUrl={applyUrl ?? null}
            distributionId={distributionId ?? null}
            companyId={companyId ?? null}
            companyPublicSlug={requirement.company.publicSlug}
          />
          <SourcedCandidateForm jobId={requirement.id} />
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-bold text-black">Requirement information</h2>
            <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-medium text-black">Role</dt>
                <dd>{requirement.title}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Client</dt>
                <dd>{requirement.company.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Lifecycle</dt>
                <dd>
                  {requirementLifecycleLabels[requirement.requirementLifecycle]}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Profiles</dt>
                <dd>{applications.length}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Shortlisted</dt>
                <dd>{stageCounts.SHORTLISTED}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Selected</dt>
                <dd>{stageCounts.SELECTED}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Sourcing database</dt>
                <dd>
                  {getSourcingDatabaseLabel(requirement.sourcingDatabaseSource)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Shortlisting due</dt>
                <dd>
                  {requirement.shortlistingDueAt
                    ? formatJobDateTime(requirement.shortlistingDueAt)
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">
                  Shortlisting completed
                </dt>
                <dd>
                  {requirement.shortlistingCompletedAt
                    ? formatJobDateTime(requirement.shortlistingCompletedAt)
                    : "Not completed"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-bold text-black">Candidate pipeline</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {PIPELINE_STAGES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setPipelineFilter(status);
                    setActiveTab("pipeline");
                  }}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black hover:bg-zinc-200"
                >
                  {getApplicationPipelineStatusLabel(status)}:{" "}
                  {stageCounts[status]}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-bold text-black">Relevant actions</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="requirement-interviewer"
                  className="block text-sm font-medium text-black"
                >
                  Assigned Interviewer
                </label>
                <select
                  id="requirement-interviewer"
                  value={requirement.assignedInterviewerId?.toString() ?? ""}
                  disabled={isAssigning || assignmentLocked}
                  onChange={(event) =>
                    void handleAssignInterviewer(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  className="mt-2 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-100"
                >
                  <option value="">Not assigned</option>
                  {interviewers.map((interviewer) => (
                    <option key={interviewer.id} value={interviewer.id}>
                      {interviewer.name}
                    </option>
                  ))}
                </select>
                {assignmentLocked ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    Interviewer assignment is locked after interviewer
                    notification.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                {requirement.requirementLifecycle === "REQUIREMENT_POSTED" &&
                  requirement.assignedInterviewerId && (
                    <button
                      type="button"
                      disabled={isLifecycleBusy}
                      onClick={() =>
                        void runLifecycleAction(() =>
                          notifyAssignedInterviewer(requirement.id),
                        "T68",
                        )
                      }
                      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {isLifecycleBusy ? "Working..." : "Notify Interviewer"}
                    </button>
                  )}
                {requirement.requirementLifecycle === "INTERVIEWER_NOTIFIED" &&
                  requirement.sourcingDatabaseSource && (
                    <button
                      type="button"
                      disabled={isLifecycleBusy}
                      onClick={() =>
                        void runLifecycleAction(() =>
                          markJobSourcingAccessReceived(requirement.id),
                        "T69",
                        )
                      }
                      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {isLifecycleBusy ? "Working..." : "Mark Access Received"}
                    </button>
                  )}
                {requirement.requirementLifecycle === "SOURCING_SHORTLISTING" &&
                  requirement.sourcingAccessReceivedAt &&
                  !requirement.shortlistingCompletedAt && (
                    <button
                      type="button"
                      disabled={isLifecycleBusy}
                      onClick={() =>
                        void runLifecycleAction(() =>
                          completeJobShortlisting(requirement.id),
                        "T70",
                        )
                      }
                      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {isLifecycleBusy
                        ? "Working..."
                        : "Complete Shortlisting"}
                    </button>
                  )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "candidates" &&
        applications.some(
          (a) =>
            a.status === ApplicationPipelineStatus.SELECTED ||
            a.status === ApplicationPipelineStatus.HIRED,
        ) && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <h3 className="text-sm font-bold text-zinc-900">Offers</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Mint a single-use acceptance link for a selected or hired
              candidate. Acceptance is hash-verified and timestamped.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {applications
                .filter(
                  (a) =>
                    a.status === ApplicationPipelineStatus.SELECTED ||
                    a.status === ApplicationPipelineStatus.HIRED,
                )
                .map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-zinc-800">
                      {a.candidate.name}
                      {a.offerAcceptedAt ? " · ✓ accepted" : ""}
                    </p>
                    <MintOfferLinkButton applicationId={a.id} />
                  </div>
                ))}
            </div>
          </div>
        )}

      {(activeTab === "candidates" || activeTab === "pipeline") && (
        <div className="mt-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-black">
                {activeTab === "candidates"
                  ? "Candidates in this requirement"
                  : "Pipeline stages"}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Existing candidate pipeline for this role. Transitions reuse the
                canonical pipeline rules.
              </p>
            </div>
            <div>
              <label
                htmlFor="requirement-pipeline-filter"
                className="block text-sm font-medium text-black"
              >
                Pipeline stage
              </label>
              <select
                id="requirement-pipeline-filter"
                value={pipelineFilter}
                onChange={(event) =>
                  setPipelineFilter(event.target.value as PipelineFilter)
                }
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-black outline-none transition focus:border-black md:min-w-52"
              >
                <option value="ALL">All stages</option>
                {PIPELINE_STAGES.map((status) => (
                  <option key={status} value={status}>
                    {getApplicationPipelineStatusLabel(status)} (
                    {stageCounts[status]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredApplications.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
              <p className="text-lg font-medium text-black">
                No candidates in this view
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Source profiles into this requirement or choose another stage.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredApplications.map((application) => {
                const moveOptions = (
                  APPLICATION_STATUS_TRANSITIONS[application.status] ?? []
                ).map((status) => ({
                  status,
                  label: getMoveLabel(status),
                }));

                return (
                  <PipelineCard
                    key={application.id}
                    id={application.id}
                    candidateName={application.candidate.name}
                    candidateRole={application.candidate.role}
                    currentEmployer={application.candidate.currentEmployer}
                    location={application.candidate.location}
                    experienceYears={application.candidate.experienceYears}
                    skills={application.candidate.skills}
                    expectedCTC={application.candidate.expectedCTC}
                    jobTitle={requirement.title}
                    companyName={requirement.company.name}
                    source={application.source}
                    expertScore={application.expertScore}
                    status={application.status}
                    moveOptions={moveOptions}
                    monitorNote={getMonitorNote(application.status)}
                    isMoving={movingApplicationId === application.id}
                    requirementHref={`/dashboard/requirements/${requirement.id}`}
                    onMove={handleMove}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "evaluations" && (
        <div className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-black">Evaluations</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Evaluation records for candidates in this requirement.
              </p>
            </div>
            <Link
              href={`/dashboard/technical-evaluations?requirementId=${requirement.id}`}
              className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100"
            >
              Open Technical Evaluations
            </Link>
          </div>

          {evaluations.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
              <p className="text-lg font-medium text-black">
                No evaluations recorded
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {evaluations.map((evaluation) => (
                <article
                  key={evaluation.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <h3 className="text-lg font-bold text-black">
                    {evaluation.application.candidate.name}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    {evaluation.interviewer.name}
                  </p>
                  <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-black">Overall score</dt>
                      <dd>{evaluation.overallScore ?? "Not provided"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Recommendation</dt>
                      <dd>
                        {getRecommendationLabel(evaluation.recommendation)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Fit decision</dt>
                      <dd>{getFitDecisionLabel(evaluation.fitDecision)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Questions</dt>
                      <dd>{evaluation.questions.length}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "interviews" && (
        <div className="mt-8">
          <div>
            <h2 className="text-xl font-bold text-black">Interviews</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Interviews recorded by the assigned interviewer.
            </p>
          </div>

          {interviews.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
              <p className="text-lg font-medium text-black">
                No interviews recorded
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {interviews.map((interview) => (
                <article
                  key={interview.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <h3 className="text-lg font-bold text-black">
                    {interview.application.candidate.name}
                  </h3>
                  <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-black">Type</dt>
                      <dd>{interview.type}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Result</dt>
                      <dd>{interview.result}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">When</dt>
                      <dd>{formatJobDateTime(interview.interviewAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Pipeline stage</dt>
                      <dd>
                        {getApplicationPipelineStatusLabel(
                          interview.application.status,
                        )}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <h2 className="text-xl font-bold text-black">Activity</h2>
          <p className="mt-3 text-sm text-zinc-600">
            Activity history is not available yet. This section is deferred
            until an audit trail exists.
          </p>
        </div>
      )}

      {activeTab === "billing" && (
        <div className="mt-8">
          {countByStatus(applications, ApplicationPipelineStatus.SELECTED) >
            0 &&
          countByStatus(applications, ApplicationPipelineStatus.HIRED) === 0 &&
          billingRecords.length === 0 ? (
            <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Awaiting client hire confirmation. Billing has not been generated.
            </div>
          ) : null}
          <BillingRecordsPanel
            mode="admin"
            records={billingRecords}
            showSearch={false}
            title="Requirement billing"
            description={
              billingRecords.length === 0
                ? "Billing is generated after hire confirmation. Selected candidates do not generate billing."
                : "Internal billing generated after hire confirmation. Payment processing is not available."
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
