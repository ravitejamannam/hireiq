import { notFound } from "next/navigation";
import Link from "next/link";

import BillingAdminStatusControls from "@/components/billing/BillingAdminStatusControls";
import BillingRecordDetail from "@/components/billing/BillingRecordDetail";
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

      <BillingRecordDetail
        record={record}
        requirementHref={`/dashboard/requirements/${record.job.id}`}
        manageSlot={
          <div>
            <p className="text-sm font-medium text-black">Manage status</p>
            <p className="mt-1 text-xs text-zinc-500">
              Admin-only internal status markers. This does not collect payment.
            </p>
            <div className="mt-3">
              <BillingAdminStatusControls
                recordId={record.id}
                status={record.status}
              />
            </div>
          </div>
        }
      />
    </DashboardLayout>
  );
}
