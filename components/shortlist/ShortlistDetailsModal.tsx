"use client";

import type {
  EvaluationFitDecision,
  Recommendation,
  SourcingDatabaseSource,
} from "@prisma/client";

import { getApplicationSourceLabel } from "@/components/applications/ApplicationForm";
import {
  getFitDecisionLabel,
  getRecommendationLabel,
} from "@/components/evaluations/EvaluationForm";
import { formatJobDateTime } from "@/components/jobs/JobCard";

type ShortlistQuestion = {
  id: number;
  question: string;
  answer: string | null;
  expertComment: string | null;
  score: number | null;
  difficulty: string | null;
  weight: string | null;
};

type ShortlistDetailsModalProps = {
  isOpen: boolean;
  candidateName: string;
  role: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  source: SourcingDatabaseSource | null;
  jobTitle: string;
  companyName: string;
  interviewerName: string | null;
  expertScore: number | null;
  overallScore: number | null;
  recommendation: Recommendation | null;
  hireProbability: string | null;
  fitDecision: EvaluationFitDecision | null;
  notes: string | null;
  recordingUrl: string | null;
  hasEvaluation: boolean;
  isLoadingEvaluation?: boolean;
  questions: ShortlistQuestion[];
  shortlistingCompletedAt: Date | null;
  errorMessage?: string;
  onClose: () => void;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

export default function ShortlistDetailsModal({
  isOpen,
  candidateName,
  role,
  currentEmployer,
  location,
  experienceYears,
  skills,
  expectedCTC,
  source,
  jobTitle,
  companyName,
  interviewerName,
  expertScore,
  overallScore,
  recommendation,
  hireProbability,
  fitDecision,
  notes,
  recordingUrl,
  hasEvaluation,
  isLoadingEvaluation = false,
  questions,
  shortlistingCompletedAt,
  errorMessage = "",
  onClose,
}: ShortlistDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Shortlist Details
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">{candidateName}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {jobTitle} — {companyName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close shortlist details"
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        {errorMessage && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-8 space-y-8">
          <section>
            <h3 className="text-lg font-semibold text-black">Candidate Profile</h3>
            <dl className="mt-4 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-black">Candidate</dt>
                <dd>{candidateName}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Role</dt>
                <dd>{role}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Employer</dt>
                <dd>{formatOptional(currentEmployer)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Location</dt>
                <dd>{formatOptional(location)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Experience</dt>
                <dd>{experienceYears} years</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Expected CTC</dt>
                <dd>{formatOptional(expectedCTC)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-black">Skills</dt>
                <dd>{formatOptional(skills)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Source</dt>
                <dd>{getApplicationSourceLabel(source)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-black">Requirement</h3>
            <dl className="mt-4 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-black">Job title</dt>
                <dd>{jobTitle}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Company</dt>
                <dd>{companyName}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Interviewer</dt>
                <dd>{interviewerName || "Not assigned"}</dd>
              </div>
              {shortlistingCompletedAt && (
                <div>
                  <dt className="font-medium text-black">
                    Requirement shortlisting completed
                  </dt>
                  <dd>{formatJobDateTime(shortlistingCompletedAt)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-black">Evaluation Summary</h3>
            {isLoadingEvaluation ? (
              <p className="mt-4 text-sm text-zinc-500">Loading evaluation...</p>
            ) : !hasEvaluation ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Evaluation not recorded
              </p>
            ) : (
              <dl className="mt-4 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-black">Expert score</dt>
                  <dd>{formatOptional(expertScore)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Overall score</dt>
                  <dd>{formatOptional(overallScore)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Recommendation</dt>
                  <dd>{getRecommendationLabel(recommendation)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Hire probability</dt>
                  <dd>{formatOptional(hireProbability)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Fit decision</dt>
                  <dd>{getFitDecisionLabel(fitDecision)}</dd>
                </div>
              </dl>
            )}
          </section>

          <section>
            <h3 className="text-lg font-semibold text-black">Expert Notes</h3>
            <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              {!hasEvaluation
                ? "Evaluation not recorded"
                : formatOptional(notes)}
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-black">Recording</h3>
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              {!hasEvaluation ? (
                "Evaluation not recorded"
              ) : recordingUrl ? (
                <a
                  href={recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-black underline underline-offset-2"
                >
                  {recordingUrl}
                </a>
              ) : (
                "Not provided"
              )}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-black">Questions & Answers</h3>
            {!hasEvaluation ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Evaluation not recorded
              </p>
            ) : isLoadingEvaluation ? (
              <p className="mt-4 text-sm text-zinc-500">Loading questions...</p>
            ) : questions.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No questions recorded.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {questions.map((question, index) => (
                  <article
                    key={question.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <p className="text-sm font-semibold text-black">
                      Question {index + 1}
                    </p>
                    <p className="mt-2 text-sm text-zinc-700">{question.question}</p>
                    <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-black">Candidate answer</dt>
                        <dd>{formatOptional(question.answer)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-black">Score</dt>
                        <dd>{formatOptional(question.score)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-black">Difficulty</dt>
                        <dd>{formatOptional(question.difficulty)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-black">Weight</dt>
                        <dd>{formatOptional(question.weight)}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-black">Expert comment</dt>
                        <dd>{formatOptional(question.expertComment)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
