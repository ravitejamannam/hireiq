import { notFound } from "next/navigation";
import Link from "next/link";

import BillingRecordsPanel from "@/components/billing/BillingRecordsPanel";
import { BILLING_GENERATED_AFTER_HIRE } from "@/components/billing/billing-labels";
import ClientRequirementNav from "@/components/client/ClientRequirementNav";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientApplicationsForRequirement } from "@/lib/repositories/application-repository";
import { getClientBillingForRequirement } from "@/lib/repositories/billing-repository";
import { getJobById } from "@/lib/repositories/job-repository";

type ClientRequirementBillingPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientRequirementBillingPage({
  params,
  searchParams,
}: ClientRequirementBillingPageProps) {
  // Ignore tenant query params — company comes from the session User only.
  void searchParams;

  await requireClientPortal();

  const { id } = await params;
  const requirementId = Number(id);

  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    notFound();
  }

  const requirement = await getJobById(requirementId);

  if (!requirement) {
    notFound();
  }

  const [records, applications] = await Promise.all([
    getClientBillingForRequirement(requirementId),
    getClientApplicationsForRequirement(requirementId),
  ]);

  const shortlistedCount = applications.filter(
    (application) => application.status === "SHORTLISTED",
  ).length;
  const selectedCount = applications.filter(
    (application) => application.status === "SELECTED",
  ).length;
  const hiredCount = applications.filter(
    (application) => application.status === "HIRED",
  ).length;

  const awaitingHireConfirmation =
    records.length === 0 && selectedCount > 0 && hiredCount === 0;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/client/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Requirements
        </Link>
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Billing
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          {requirement.title}
        </h1>
        <p className="mt-2 text-zinc-600">{requirement.company.name}</p>
        <p className="mt-2 text-sm text-zinc-600">
          {BILLING_GENERATED_AFTER_HIRE}.
        </p>
      </div>

      <ClientRequirementNav
        requirementId={requirementId}
        candidateCount={applications.length}
        shortlistedCount={shortlistedCount}
        active="billing"
      />

      {awaitingHireConfirmation ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Selected candidates are awaiting hire confirmation. Billing has not
          been generated.
        </div>
      ) : null}

      <div className="mt-8">
        <BillingRecordsPanel
          mode="client"
          records={records}
          showSearch={false}
          title="Billing status"
          description={
            records.length === 0
              ? "Billing is generated after hire confirmation. Selected candidates do not generate billing."
              : "Read-only billing generated after hire confirmation for this requirement."
          }
        />
      </div>
    </div>
  );
}
