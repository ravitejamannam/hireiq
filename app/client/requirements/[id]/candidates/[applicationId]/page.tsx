import { notFound } from "next/navigation";
import Link from "next/link";

import DecisionSupportRails from "@/components/candidates/DecisionSupportRails";
import ClientCandidateProfile from "@/components/client/ClientCandidateProfile";
import { selectPrimaryClientEvaluation } from "@/components/client/client-labels";
import { getApplicationAssessmentSummary } from "@/lib/assessments/assessment-service";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getDecisionSupportForCandidate } from "@/lib/candidates/decision-support-service";
import { getOrMaterializeCandidateProfile } from "@/lib/candidates/candidate-profile-service";
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

  const client = await requireClientPortal();

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
  const profile = await getOrMaterializeCandidateProfile(
    application.candidate.id,
  );
  const assessment = await getApplicationAssessmentSummary(application.id);
  let signals: Awaited<
    ReturnType<typeof getDecisionSupportForCandidate>
  >["signals"] = [];
  try {
    const view = await getDecisionSupportForCandidate(application.candidate.id, {
      companyId: client.companyId,
      skipAdmin: true,
    });
    signals = view.signals;
  } catch {
    signals = [];
  }

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

      <div className="mb-8">
        <DecisionSupportRails signals={signals} />
      </div>

      <ClientCandidateProfile
        candidate={{
          applicationId: application.id,
          name: profile.name,
          headline: profile.headline,
          currentEmployer: profile.currentEmployer,
          location: profile.location,
          experienceYears: profile.experienceYears,
          skills: profile.skillsText,
          expectedCTC: profile.expectedCTC,
          linkedInUrl: profile.linkedInUrl,
          pipelineStatus: application.status,
          source: application.source,
          expertScore: application.expertScore,
          requirementTitle: application.job.title,
          companyName: application.job.company.name,
          requirementStatus: application.job.status,
          interviews: application.interviews,
          codingTests: application.codingTests,
          assessment,
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
