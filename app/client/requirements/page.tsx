import ClientRequirementsClient from "@/components/client/ClientRequirementsClient";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getJobs } from "@/lib/repositories/job-repository";

export default async function ClientRequirementsPage() {
  const [client, jobs] = await Promise.all([
    requireClientPortal(),
    getJobs(),
  ]);

  return (
    <ClientRequirementsClient
      companyName={client.company.name}
      initialRequirements={jobs}
    />
  );
}
