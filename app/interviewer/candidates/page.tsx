import Link from "next/link";

import InterviewerCandidatesClient from "@/components/interviewer/InterviewerCandidatesClient";
import { getInterviewerApplications } from "@/lib/repositories/interviewer-portal-repository";

export default async function InterviewerCandidatesPage() {
  const applications = await getInterviewerApplications();

  return (
    <div>
      <div className="mb-2">
        <Link
          href="/interviewer/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          Browse by requirement
        </Link>
      </div>
      <InterviewerCandidatesClient
        candidates={applications.map((application) => ({
          id: application.id,
          status: application.status,
          source: application.source,
          expertScore: application.expertScore,
          candidate: application.candidate,
          evaluations: application.evaluations.map((evaluation) => ({
            id: evaluation.id,
            evaluatedAt: evaluation.evaluatedAt,
          })),
          job: {
            id: application.job.id,
            title: application.job.title,
            companyName: application.job.company.name,
          },
        }))}
      />
    </div>
  );
}
