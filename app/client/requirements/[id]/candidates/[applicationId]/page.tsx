import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate",
};

import { notFound } from "next/navigation";
import Link from "next/link";

import ClientCandidateProfile from "@/components/client/ClientCandidateProfile";
import { selectPrimaryClientEvaluation } from "@/components/client/client-labels";
import { getApplicationAssessmentSummary } from "@/lib/assessments/assessment-service";
import { requireClientPortal } from "@/lib/auth/authorization";
import { clientMayConfirmHire } from "@/lib/hiring/hire-confirmation-auth";
import { getOrMaterializeCandidateProfile } from "@/lib/candidates/candidate-profile-service";
import { getClientApplicationForRequirement } from "@/lib/repositories/application-repository";
import { getApplicationHiringTimeline } from "@/lib/hiring/requirement-desk";
import ApplicationTimeline from "@/components/hiring/ApplicationTimeline";
import HumanRelevancePanel from "@/components/client/HumanRelevancePanel";
import { loadHumanRelevanceCollection } from "@/lib/relevance/human-relevance-operations";

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

  const timeline = await getApplicationHiringTimeline(application.id);
  const relevance = await loadHumanRelevanceCollection({
    companyId: client.companyId,
    jobId: requirementId,
    applicationId: application.id,
  });

  const evaluation = selectPrimaryClientEvaluation(application.evaluations);
  const profile = await getOrMaterializeCandidateProfile(
    application.candidate.id,
  );
  const assessment = await getApplicationAssessmentSummary(application.id);

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
        <Link
          href={`/client/requirements/${requirementId}/relevance/${applicationId}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          Blind relevance collection
        </Link>
      </div>

      {relevance && relevance.evidence.length > 0 ? (
        <HumanRelevancePanel
          applicationId={relevance.applicationId}
          specificationId={relevance.specificationId}
          jobTitle={relevance.jobTitle}
          candidateName={relevance.candidateName}
          requirements={relevance.requirements}
          evidence={relevance.evidence}
        />
      ) : null}

      {timeline && timeline.length > 0 ? (
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-bold text-black">Hiring timeline</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Apply, assessment, interviews, ranking, and offer. Assessment score
            is not a hire decision.
          </p>
          <div className="mt-6">
            <ApplicationTimeline events={timeline} />
          </div>
        </section>
      ) : null}

      <ClientCandidateProfile
        canConfirmHire={await clientMayConfirmHire(client)}
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
          aboutText: profile.aboutText,
          roleTitle: profile.roleTitle,
          domains: profile.domains,
          githubUrl: profile.githubUrl,
          portfolioUrl: profile.portfolioUrl,
          twitterUrl: profile.twitterUrl,
          videoResumeUrl: profile.videoResumeUrl,
          leetcodeUrl: profile.leetcodeUrl,
          socialLinks: profile.socialLinks,
          photoUrl: profile.photoUrl,
          githubProof: profile.githubProof,
          leetcodeProof: profile.leetcodeProof,
          experiences: profile.experiences,
          education: profile.education,
          projects: profile.projects,
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
