import BillingRecordsPanel from "@/components/billing/BillingRecordsPanel";
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
        <p className="mt-2 text-zinc-600">
          Billing status for your company requirements. Read-only.
        </p>
      </div>

      <div className="mt-8">
        <BillingRecordsPanel
          mode="client"
          records={records}
          title="Your billing records"
          description="Statuses shown here are internal HireIQ billing markers. Payment collection is not available in this portal."
        />
      </div>
    </div>
  );
}
