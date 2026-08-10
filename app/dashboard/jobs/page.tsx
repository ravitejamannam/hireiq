import JobsClient from "@/components/jobs/JobsClient";
import { getJobs } from "@/lib/repositories/job-repository";
import { getCompanies } from "@/lib/repositories/company-repository";

export default async function JobsPage() {
  const [jobs, companies] = await Promise.all([getJobs(), getCompanies()]);

  return <JobsClient initialJobs={jobs} companies={companies} />;
}
