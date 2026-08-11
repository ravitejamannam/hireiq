import ApplicationsClient from "@/components/applications/ApplicationsClient";
import { getApplications } from "@/lib/repositories/application-repository";
import { getCandidates } from "@/lib/repositories/candidate-repository";
import { getJobs } from "@/lib/repositories/job-repository";

export default async function ApplicationsPage() {
  const [applications, candidates, jobs] = await Promise.all([
    getApplications(),
    getCandidates(),
    getJobs(),
  ]);

  const applicationViewModels = applications.map((application) => ({
    ...application,
    candidate: {
      id: application.candidate.id,
      name: application.candidate.name,
      role: application.candidate.role,
      experienceYears: application.candidate.experienceYears,
      location: application.candidate.location,
      currentEmployer: application.candidate.currentEmployer,
      skills: application.candidate.skills,
      expectedCTC: application.candidate.expectedCTC,
      companyId: application.candidate.companyId,
      company: application.candidate.company,
    },
  }));

  const candidateOptions = candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    company: {
      id: candidate.company.id,
      name: candidate.company.name,
    },
  }));

  return (
    <ApplicationsClient
      initialApplications={applicationViewModels}
      candidates={candidateOptions}
      jobs={jobs}
    />
  );
}
