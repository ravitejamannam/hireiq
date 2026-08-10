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

  return (
    <ApplicationsClient
      initialApplications={applications}
      candidates={candidates}
      jobs={jobs}
    />
  );
}
