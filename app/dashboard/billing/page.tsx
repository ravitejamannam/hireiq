import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing",
};

import BillingRecordsPanel from "@/components/billing/BillingRecordsPanel";
import { BILLING_GENERATED_AFTER_HIRE } from "@/components/billing/billing-labels";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getBillingRecords } from "@/lib/repositories/billing-repository";

export default async function AdminBillingPage() {
  const records = await getBillingRecords();

  return (
    <DashboardLayout>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Billing</h1>
        <p className="mt-2 text-zinc-600">{BILLING_GENERATED_AFTER_HIRE}.</p>
      </div>

      <div className="mt-8">
        <BillingRecordsPanel
          mode="admin"
          records={records}
          title="Billing records"
          description="Oversight for billing generated after a client confirms hire. Payment processing is not available."
        />
      </div>
    </DashboardLayout>
  );
}
