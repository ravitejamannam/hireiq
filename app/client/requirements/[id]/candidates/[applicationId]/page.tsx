import { notFound } from "next/navigation";
import Link from "next/link";

import ClientCandidateProfile from "@/components/client/ClientCandidateProfile";
import { selectPrimaryClientEvaluation } from "@/components/client/client-labels";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientApplicationForRequirement } from "@/lib/repositories/application-repository";

type ClientCandidateDetailPageProps = {
  params: Promise<{
    id: string;
    applicationId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientCandidateDetailPage({
  params,
  searchParams,
}: ClientCandidateDetailPageProps) {
  // Ignore tenant query params — company comes from the session User only.
  void searchParams;

  await requireClientPortal();

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

  const application = await getClientApplicationForRequirement(
    requirementId,
    applicationId,
  );

  if (!application) {
    notFound();
  }

  const evaluation = selectPrimaryClientEvaluation(application.evaluations);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href={`/client/requirements/${requirementId}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirement
        </Link>
        <Link
          href="/client/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <ClientCandidateProfile
        candidate={{
          name: application.candidate.name,
          role: application.candidate.role,
          currentEmployer: application.candidate.currentEmployer,
          location: application.candidate.location,
          experienceYears: application.candidate.experienceYears,
          skills: application.candidate.skills,
          expectedCTC: application.candidate.expectedCTC,
          pipelineStatus: application.status,
          source: application.source,
          expertScore: application.expertScore,
          requirementTitle: application.job.title,
          companyName: application.job.company.name,
          requirementStatus: application.job.status,
          evaluation: evaluation
            ? {
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
                  question: question.question,
                  answer: question.answer,
                  expertComment: question.expertComment,
                  score: question.score,
                  difficulty: question.difficulty,
                  weight: question.weight,
                })),
              }
            : null,
        }}
      />
    </div>
  );
}
