import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing",
};

import { notFound } from "next/navigation";
import Link from "next/link";

import BillingRecordDetail from "@/components/billing/BillingRecordDetail";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientBillingRecordById } from "@/lib/repositories/billing-repository";

type ClientBillingDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientBillingDetailPage({
  params,
  searchParams,
}: ClientBillingDetailPageProps) {
  // Ignore tenant query params — company comes from the session User only.
  void searchParams;

  await requireClientPortal();

  const { id } = await params;
  const billingId = Number(id);

  if (!Number.isInteger(billingId) || billingId <= 0) {
    notFound();
  }

  const record = await getClientBillingRecordById(billingId);

  if (!record) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/client/billing"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Billing
        </Link>
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Billing record
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          {record.job.title}
        </h1>
        <p className="mt-2 text-zinc-600">{record.company.name}</p>
      </div>

      <BillingRecordDetail
        record={record}
        requirementHref={`/client/requirements/${record.job.id}`}
        invoiceHref={`/client/billing/${record.id}/invoice`}
        candidateHref={(applicationId) =>
          `/client/requirements/${record.job.id}/candidates/${applicationId}`
        }
      />
    </div>
  );
}
