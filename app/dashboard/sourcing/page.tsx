import SourcingClient from "@/components/sourcing/SourcingClient";
import { getApplications } from "@/lib/repositories/application-repository";
import { getJobs } from "@/lib/repositories/job-repository";

export default async function SourcingPage() {
  const [jobs, applications] = await Promise.all([
    getJobs(),
    getApplications(),
  ]);

  return (
    <SourcingClient initialJobs={jobs} initialApplications={applications} />
  );
}
