import type {
  ApplicationPipelineStatus,
  EvaluationFitDecision,
  InterviewResult,
  InterviewType,
  JobStatus,
  Recommendation,
  RoleCategory,
} from "@prisma/client";

import {
  clientJobStatusLabels,
  formatClientDate,
  formatClientOptional,
  getClientFitDecisionLabel,
  getClientPipelineStatusLabel,
  getClientRecommendationLabel,
  getClientSourceLabel,
} from "@/components/client/client-labels";
import InterviewerEvaluationWorkspace from "@/components/interviewer/InterviewerEvaluationWorkspace";

type Question = {
  id: number;
  question: string;
  answer: string | null;
  expertComment: string | null;
  score: number | null;
  difficulty: string | null;
  weight: string | null;
};

type EvaluationData = {
  id: number;
  overallScore: number | null;
  scorecard: unknown;
  notes: string | null;
  recordingUrl: string | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: string | null;
  questions: Question[];
};

type InterviewerCandidateDetailProps = {
  applicationId: number;
  candidate: {
    name: string;
    role: string;
    experienceYears: number;
    location: string | null;
    currentEmployer: string | null;
    skills: string | null;
    expectedCTC: string | null;
  };
  application: {
    status: ApplicationPipelineStatus;
    source: string | null;
    expertScore: number | null;
  };
  requirement: {
    title: string;
    companyName: string;
    status: JobStatus;
    roleCategory: RoleCategory | null;
    location: string | null;
    experienceRange: string | null;
  };
  interviews: Array<{
    id: number;
    type: InterviewType;
    interviewAt: Date;
    result: InterviewResult;
  }>;
  evaluation: EvaluationData | null;
};

const interviewTypeLabels: Record<InterviewType, string> = {
  PHONE_SCREEN: "Phone Screen",
  TECHNICAL: "Technical",
  SYSTEM_DESIGN: "System Design",
  HR: "HR",
};

const interviewResultLabels: Record<InterviewResult, string> = {
  PENDING: "Pending",
  PASSED: "Passed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default function InterviewerCandidateDetail({
  applicationId,
  candidate,
  application,
  requirement,
  interviews,
  evaluation,
}: InterviewerCandidateDetailProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Candidate profile
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">{candidate.name}</h1>
        <p className="mt-2 text-zinc-600">{candidate.role}</p>

        <dl className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-medium text-black">Experience</dt>
            <dd>{candidate.experienceYears} years</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd>{formatClientOptional(candidate.location)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Current employer</dt>
            <dd>{formatClientOptional(candidate.currentEmployer)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Expected CTC</dt>
            <dd>{formatClientOptional(candidate.expectedCTC)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Pipeline status</dt>
            <dd>{getClientPipelineStatusLabel(application.status)}</dd>
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
            <dd>{formatClientOptional(candidate.skills)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Requirement Context</h2>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-medium text-black">Requirement</dt>
            <dd>{requirement.title}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Company</dt>
            <dd>{requirement.companyName}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Role</dt>
            <dd>{formatClientOptional(requirement.roleCategory)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd>{formatClientOptional(requirement.location)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Experience range</dt>
            <dd>{formatClientOptional(requirement.experienceRange)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Job status</dt>
            <dd>{clientJobStatusLabels[requirement.status]}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Interview Context</h2>
        {interviews.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">
            No interviews recorded for this application.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {interviews.map((interview) => (
              <article
                key={interview.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              >
                <dl className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-black">Type</dt>
                    <dd>{interviewTypeLabels[interview.type]}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Scheduled</dt>
                    <dd>{formatDateTime(interview.interviewAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Result</dt>
                    <dd>{interviewResultLabels[interview.result]}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      {evaluation?.recordingUrl ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-bold text-black">Recording</h2>
          <p className="mt-3 text-sm text-zinc-600">
            <a
              href={evaluation.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-black underline underline-offset-2"
            >
              Open recording
            </a>
          </p>
          {evaluation.evaluatedAt ? (
            <p className="mt-2 text-sm text-zinc-600">
              Evaluated: {formatClientDate(new Date(evaluation.evaluatedAt))} ·{" "}
              {getClientRecommendationLabel(evaluation.recommendation)} ·{" "}
              {getClientFitDecisionLabel(evaluation.fitDecision)}
            </p>
          ) : null}
        </section>
      ) : null}

      <InterviewerEvaluationWorkspace
        key={
          evaluation
            ? `${evaluation.id}-${evaluation.questions.length}-${evaluation.evaluatedAt ?? "open"}`
            : `new-${applicationId}`
        }
        applicationId={applicationId}
        evaluation={evaluation}
      />
    </div>
  );
}
