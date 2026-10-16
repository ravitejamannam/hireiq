import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Requirements",
};

import JobsClient from "@/components/jobs/JobsClient";
import { getCompanies } from "@/lib/repositories/company-repository";
import { getInterviewers } from "@/lib/repositories/interviewer-repository";
import { getJobs } from "@/lib/repositories/job-repository";

export default async function JobsPage() {
  const [jobs, companies, interviewers] = await Promise.all([
    getJobs(),
    getCompanies(),
    getInterviewers(),
  ]);

  return (
    <JobsClient
      initialJobs={jobs}
      companies={companies}
      interviewers={interviewers}
    />
  );
}
