import type {
  ApplicationPipelineStatus,
  CodingTestStatus,
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
import InterviewerCodingTestPanel from "@/components/interviewer/InterviewerCodingTestPanel";
import InterviewerEvaluationWorkspace from "@/components/interviewer/InterviewerEvaluationWorkspace";
import InterviewerInterviewPanel from "@/components/interviewer/InterviewerInterviewPanel";
import InterviewerShortlistActions from "@/components/interviewer/InterviewerShortlistActions";
import AssessmentScoreReadout, {
  type AssessmentScoreSummary,
} from "@/components/assess/AssessmentScoreReadout";
import CandidateStructuredProfile from "@/components/candidates/CandidateStructuredProfile";
import type { SafeCandidateProfile } from "@/lib/candidates/candidate-profile-types";

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
    headline: string | null;
    experienceYears: number | null;
    location: string | null;
    currentEmployer: string | null;
    skills: string | null;
    expectedCTC: string | null;
    linkedInUrl: string | null;
    aboutText?: string | null;
    roleTitle?: string | null;
    domains?: string[];
    githubUrl?: string | null;
    portfolioUrl?: string | null;
    twitterUrl?: string | null;
    videoResumeUrl?: string | null;
    leetcodeUrl?: string | null;
    socialLinks?: SafeCandidateProfile["socialLinks"];
    photoUrl?: string | null;
    githubProof?: SafeCandidateProfile["githubProof"];
    leetcodeProof?: SafeCandidateProfile["leetcodeProof"];
    experiences?: SafeCandidateProfile["experiences"];
    education?: SafeCandidateProfile["education"];
    projects?: SafeCandidateProfile["projects"];
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
  codingTests: Array<{
    id: number;
    title: string;
    score: number;
    maxScore: number;
    status: CodingTestStatus;
    takenAt: Date;
  }>;
  evaluation: EvaluationData | null;
  assessment?: AssessmentScoreSummary | null;
};

export default function InterviewerCandidateDetail({
  applicationId,
  candidate,
  application,
  requirement,
  interviews,
  codingTests,
  evaluation,
  assessment,
}: InterviewerCandidateDetailProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <CandidateStructuredProfile
          profile={{
            name: candidate.name,
            headline: candidate.headline,
            roleTitle: candidate.roleTitle ?? candidate.headline,
            location: candidate.location,
            aboutText: candidate.aboutText ?? null,
            domains: candidate.domains ?? [],
            experienceYears: candidate.experienceYears,
            linkedInUrl: candidate.linkedInUrl,
            githubUrl: candidate.githubUrl ?? null,
            portfolioUrl: candidate.portfolioUrl ?? null,
            twitterUrl: candidate.twitterUrl ?? null,
            videoResumeUrl: candidate.videoResumeUrl ?? null,
            leetcodeUrl: candidate.leetcodeUrl ?? null,
            socialLinks: candidate.socialLinks ?? [],
            photoUrl: candidate.photoUrl ?? null,
            githubProof: candidate.githubProof ?? null,
            leetcodeProof: candidate.leetcodeProof ?? null,
            experiences: candidate.experiences ?? [],
            education: candidate.education ?? [],
            projects: candidate.projects ?? [],
          }}
        />
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <dl className="grid gap-4 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
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
          </dl>
          <InterviewerShortlistActions
            applicationId={applicationId}
            status={application.status}
          />
        </div>
      </section>

      <AssessmentScoreReadout summary={assessment ?? null} />

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

      <InterviewerInterviewPanel
        applicationId={applicationId}
        interviews={interviews}
      />

      <InterviewerCodingTestPanel
        applicationId={applicationId}
        codingTests={codingTests}
      />

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
