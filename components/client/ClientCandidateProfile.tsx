import type {
  ApplicationPipelineStatus,
  CodingTestStatus,
  EvaluationFitDecision,
  InterviewResult,
  InterviewType,
  JobStatus,
  Recommendation,
} from "@prisma/client";

import ClientHireConfirmation from "@/components/client/ClientHireConfirmation";
import {
  clientJobStatusLabels,
  formatClientDate,
  formatClientDateTime,
  formatClientOptional,
  getClientCodingTestStatusLabel,
  getClientFitDecisionLabel,
  getClientInterviewResultLabel,
  getClientInterviewTypeLabel,
  getClientPipelineStatusLabel,
  getClientRecommendationLabel,
  getClientSourceLabel,
  parseClientScorecard,
  type ClientScorecardEntry,
} from "@/components/client/client-labels";
import AssessmentScoreReadout, {
  type AssessmentScoreSummary,
} from "@/components/assess/AssessmentScoreReadout";

export type ClientCandidateQuestion = {
  question: string;
  answer: string | null;
  expertComment: string | null;
  score: number | null;
  difficulty: string | null;
  weight: string | null;
};

export type ClientCandidateEvaluation = {
  overallScore: number | null;
  scorecard: unknown;
  notes: string | null;
  recordingUrl: string | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  evaluatedAt: string | null;
  questions: ClientCandidateQuestion[];
};

export type ClientCandidateProfileData = {
  applicationId: number;
  name: string;
  headline: string | null;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number | null;
  skills: string | null;
  expectedCTC: string | null;
  linkedInUrl: string | null;
  pipelineStatus: ApplicationPipelineStatus;
  source: string | null;
  expertScore: number | null;
  requirementTitle: string;
  companyName: string;
  requirementStatus: JobStatus;
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
  evaluation: ClientCandidateEvaluation | null;
  assessment?: AssessmentScoreSummary | null;
};

type ClientCandidateProfileProps = {
  candidate: ClientCandidateProfileData;
};

function ScorecardTable({ entries }: { entries: ClientScorecardEntry[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full text-left text-sm text-zinc-600">
        <thead className="bg-zinc-50 text-black">
          <tr>
            <th className="px-4 py-3 font-medium">Skill</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Comment</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.skill}-${entry.score}`} className="border-t border-zinc-200">
              <td className="px-4 py-3">{entry.skill}</td>
              <td className="px-4 py-3">{entry.score}</td>
              <td className="px-4 py-3">
                {formatClientOptional(entry.comment)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientCandidateProfile({
  candidate,
}: ClientCandidateProfileProps) {
  const evaluation = candidate.evaluation;
  const scorecard = evaluation
    ? parseClientScorecard(evaluation.scorecard)
    : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Candidate
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">{candidate.name}</h1>
        <p className="mt-2 text-zinc-600">
          {formatClientOptional(candidate.headline)}
        </p>
      </div>

      <ClientHireConfirmation
        applicationId={candidate.applicationId}
        candidateName={candidate.name}
        status={candidate.pipelineStatus}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Candidate Profile</h2>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Headline</dt>
            <dd>{formatClientOptional(candidate.headline)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Current Employer</dt>
            <dd>{formatClientOptional(candidate.currentEmployer)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Location</dt>
            <dd>{formatClientOptional(candidate.location)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Experience</dt>
            <dd>
              {candidate.experienceYears === null
                ? formatClientOptional(null)
                : `${candidate.experienceYears} years`}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Expected CTC</dt>
            <dd>{formatClientOptional(candidate.expectedCTC)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">LinkedIn</dt>
            <dd>
              {candidate.linkedInUrl ? (
                <a
                  href={candidate.linkedInUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-black underline underline-offset-2"
                >
                  View profile
                </a>
              ) : (
                formatClientOptional(null)
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-black">Skills</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {formatClientOptional(candidate.skills)}
            </dd>
          </div>
        </dl>
      </section>

      <AssessmentScoreReadout summary={candidate.assessment ?? null} />

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Requirement Context</h2>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Role</dt>
            <dd>{candidate.requirementTitle}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Company</dt>
            <dd>{candidate.companyName}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Requirement status</dt>
            <dd>{clientJobStatusLabels[candidate.requirementStatus]}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Pipeline stage</dt>
            <dd>{getClientPipelineStatusLabel(candidate.pipelineStatus)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Source</dt>
            <dd>{getClientSourceLabel(candidate.source)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Expert Review</h2>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Expert Score</dt>
            <dd>{formatClientOptional(candidate.expertScore)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-black">Expert Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {evaluation?.notes
                ? evaluation.notes
                : "Evaluation not available yet."}
            </dd>
          </div>
          </dl>
        </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Interviews</h2>
        {candidate.interviews.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            No interviews recorded yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {candidate.interviews.map((interview) => (
              <article
                key={interview.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              >
                <dl className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-black">Type</dt>
                    <dd>{getClientInterviewTypeLabel(interview.type)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Scheduled</dt>
                    <dd>
                      {formatClientDateTime(new Date(interview.interviewAt))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Result</dt>
                    <dd>{getClientInterviewResultLabel(interview.result)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Coding tests</h2>
        {candidate.codingTests.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            No coding tests recorded yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {candidate.codingTests.map((codingTest) => (
              <article
                key={codingTest.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              >
                <dl className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-medium text-black">Title</dt>
                    <dd>{codingTest.title}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Score</dt>
                    <dd>
                      {codingTest.score} / {codingTest.maxScore}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Status</dt>
                    <dd>
                      {getClientCodingTestStatusLabel(codingTest.status)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Taken</dt>
                    <dd>{formatClientDateTime(new Date(codingTest.takenAt))}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Evaluation Summary</h2>
        {!evaluation ? (
          <p className="mt-4 text-sm text-zinc-600">
            Technical evaluation has not been completed yet.
          </p>
        ) : (
          <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-black">Overall Score</dt>
              <dd>{formatClientOptional(evaluation.overallScore)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Recommendation</dt>
              <dd>
                {getClientRecommendationLabel(evaluation.recommendation)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Hire Probability</dt>
              <dd>{formatClientOptional(evaluation.hireProbability)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Fit Decision</dt>
              <dd>{getClientFitDecisionLabel(evaluation.fitDecision)}</dd>
            </div>
            <div>
              <dt className="font-medium text-black">Evaluation Date</dt>
              <dd>
                {formatClientDate(
                  evaluation.evaluatedAt
                    ? new Date(evaluation.evaluatedAt)
                    : null,
                )}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Technical Evaluation</h2>
        {!evaluation ? (
          <p className="mt-4 text-sm text-zinc-600">
            Evaluation not available yet.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            <dl className="grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-black">Overall Score</dt>
                <dd>{formatClientOptional(evaluation.overallScore)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Recommendation</dt>
                <dd>
                  {getClientRecommendationLabel(evaluation.recommendation)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Hire Probability</dt>
                <dd>{formatClientOptional(evaluation.hireProbability)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Fit Decision</dt>
                <dd>{getClientFitDecisionLabel(evaluation.fitDecision)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Evaluated At</dt>
                <dd>
                  {formatClientDate(
                    evaluation.evaluatedAt
                      ? new Date(evaluation.evaluatedAt)
                      : null,
                  )}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-sm font-medium text-black">Scorecard</h3>
              {scorecard ? (
                <ScorecardTable entries={scorecard} />
              ) : (
                <p className="mt-2 text-sm text-zinc-600">
                  No scorecard recorded.
                </p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-black">Expert Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">
                {formatClientOptional(evaluation.notes)}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-black">Recording</h3>
              {evaluation.recordingUrl ? (
                <a
                  href={evaluation.recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-black underline underline-offset-2"
                >
                  View Recording
                </a>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">
                  Recording not available.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Questions & Answers</h2>
        {!evaluation || evaluation.questions.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            No technical questions recorded.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {evaluation.questions.map((question, index) => (
              <article
                key={`${question.question}-${index}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <p className="text-sm font-semibold text-black">
                  Question {index + 1}
                </p>
                <p className="mt-2 text-sm text-zinc-700">{question.question}</p>
                <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-black">Candidate Answer</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {formatClientOptional(question.answer)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Score</dt>
                    <dd>{formatClientOptional(question.score)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Difficulty</dt>
                    <dd>{formatClientOptional(question.difficulty)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Weight</dt>
                    <dd>{formatClientOptional(question.weight)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-black">Expert Comment</dt>
                    <dd className="mt-1 whitespace-pre-wrap">
                      {formatClientOptional(question.expertComment)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
