import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing",
};

import BillingRecordsPanel from "@/components/billing/BillingRecordsPanel";
import { BILLING_GENERATED_AFTER_HIRE } from "@/components/billing/billing-labels";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientBillingRecords } from "@/lib/repositories/billing-repository";

export default async function ClientBillingPage() {
  await requireClientPortal();
  const records = await getClientBillingRecords();

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Client portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Billing</h1>
        <p className="mt-2 text-zinc-600">{BILLING_GENERATED_AFTER_HIRE}.</p>
      </div>

      <div className="mt-8">
        <BillingRecordsPanel
          mode="client"
          records={records}
          title="Your billing records"
          description="Billing for hired candidates at your company. Statuses are internal HireIQ markers. Payment collection is not available."
        />
      </div>
    </div>
  );
}
