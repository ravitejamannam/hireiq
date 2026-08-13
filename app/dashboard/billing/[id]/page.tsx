import { notFound } from "next/navigation";
import Link from "next/link";

import {
  formatBillingDateTime,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { requireAdmin } from "@/lib/auth/authorization";
import { getBillingRecordById } from "@/lib/repositories/billing-repository";

type AdminBillingDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBillingDetailPage({
  params,
  searchParams,
}: AdminBillingDetailPageProps) {
  // Ignore tenant query params — ownership is server-derived.
  void searchParams;

  await requireAdmin();

  const { id } = await params;
  const billingId = Number(id);

  if (!Number.isInteger(billingId) || billingId <= 0) {
    notFound();
  }

  const record = await getBillingRecordById(billingId);

  if (!record) {
    notFound();
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link
          href="/dashboard/billing"
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

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-xs text-zinc-500">
          Internal billing foundation only. No payment amounts, taxes, or
          gateway data are stored.
        </p>
        <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Status</dt>
            <dd>{getBillingStatusLabel(record.status)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Company</dt>
            <dd>{record.company.name}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Requirement</dt>
            <dd>
              <Link
                href={`/dashboard/requirements/${record.job.id}`}
                className="font-medium text-black underline underline-offset-2"
              >
                {record.job.title}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Created</dt>
            <dd>{formatBillingDateTime(record.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Updated</dt>
            <dd>{formatBillingDateTime(record.updatedAt)}</dd>
          </div>
        </dl>
      </section>
    </DashboardLayout>
  );
}
