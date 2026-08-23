import { notFound } from "next/navigation";
import Link from "next/link";

import InterviewerCandidateDetail from "@/components/interviewer/InterviewerCandidateDetail";
import RubricPanel from "@/components/interviewer/RubricPanel";
import { getActiveBlueprintForApplication, getRubricScoresForEvaluation } from "@/lib/interviews/blueprint-service";
import { getOrMaterializeCandidateProfile } from "@/lib/candidates/candidate-profile-service";
import { getInterviewerApplicationForJob } from "@/lib/repositories/interviewer-portal-repository";
import { getApplicationAssessmentSummary } from "@/lib/assessments/assessment-service";

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

  // T98 structured interview kit: active rubric + this interviewer's scores.
  const blueprint = await getActiveBlueprintForApplication(application.id);
  const rubricScores =
    evaluation && blueprint
      ? await getRubricScoresForEvaluation(evaluation.id)
      : [];
  const profile = await getOrMaterializeCandidateProfile(
    application.candidate.id,
  );
  const assessment = await getApplicationAssessmentSummary(application.id);

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

      {blueprint && blueprint.active ? (
        <div className="mb-8">
          <RubricPanel
            applicationId={application.id}
            evaluationId={evaluation?.id ?? null}
            competencies={blueprint.competencies.map((c) => ({
              name: c.name,
              weight: c.weight,
              description: c.description,
            }))}
            existingScores={rubricScores.map((s) => ({
              competencyName: s.competencyName,
              score: s.score,
              notes: s.notes,
            }))}
          />
        </div>
      ) : null}

      <InterviewerCandidateDetail
        applicationId={application.id}
        candidate={{
          name: profile.name,
          headline: profile.headline,
          experienceYears: profile.experienceYears,
          location: profile.location,
          currentEmployer: profile.currentEmployer,
          skills: profile.skillsText,
          expectedCTC: profile.expectedCTC,
          linkedInUrl: profile.linkedInUrl,
        }}
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
        codingTests={application.codingTests}
        assessment={assessment}
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
