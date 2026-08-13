import { notFound } from "next/navigation";
import Link from "next/link";

import InterviewerCandidateDetail from "@/components/interviewer/InterviewerCandidateDetail";
import { getInterviewerApplicationForJob } from "@/lib/repositories/interviewer-portal-repository";

type InterviewerCandidateDetailPageProps = {
  params: Promise<{
    id: string;
    applicationId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InterviewerCandidateDetailPage({
  params,
  searchParams,
}: InterviewerCandidateDetailPageProps) {
  // Ignore tenant query params — interviewer comes from the session User only.
  void searchParams;

  const { id, applicationId: applicationIdParam } = await params;
  const requirementId = Number(id);
  const applicationId = Number(applicationIdParam);

  if (
    !Number.isInteger(requirementId) ||
    requirementId <= 0 ||
    !Number.isInteger(applicationId) ||
    applicationId <= 0
  ) {
    notFound();
  }

  const application = await getInterviewerApplicationForJob(
    requirementId,
    applicationId,
  );

  if (!application) {
    notFound();
  }

  const evaluation = application.evaluations[0] ?? null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href={`/interviewer/requirements/${requirementId}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirement
        </Link>
        <Link
          href="/interviewer/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <InterviewerCandidateDetail
        applicationId={application.id}
        candidate={application.candidate}
        application={{
          status: application.status,
          source: application.source,
          expertScore: application.expertScore,
        }}
        requirement={{
          title: application.job.title,
          companyName: application.job.company.name,
          status: application.job.status,
          roleCategory: application.job.roleCategory,
          location: application.job.location,
          experienceRange: application.job.experienceRange,
        }}
        interviews={application.interviews}
        evaluation={
          evaluation
            ? {
                id: evaluation.id,
                overallScore: evaluation.overallScore,
                scorecard: evaluation.scorecard,
                notes: evaluation.notes,
                recordingUrl: evaluation.recordingUrl,
                recommendation: evaluation.recommendation,
                hireProbability: evaluation.hireProbability,
                fitDecision: evaluation.fitDecision,
                evaluatedAt: evaluation.evaluatedAt
                  ? evaluation.evaluatedAt.toISOString()
                  : null,
                questions: evaluation.questions.map((question) => ({
                  id: question.id,
                  question: question.question,
                  answer: question.answer,
                  expertComment: question.expertComment,
                  score: question.score,
                  difficulty: question.difficulty,
                  weight: question.weight,
                })),
              }
            : null
        }
      />
    </div>
  );
}
