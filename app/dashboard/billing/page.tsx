import BillingRecordsPanel from "@/components/billing/BillingRecordsPanel";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  getAdminJobsForBillingCreate,
  getBillingRecords,
} from "@/lib/repositories/billing-repository";

export default async function AdminBillingPage() {
  const [records, jobOptions] = await Promise.all([
    getBillingRecords(),
    getAdminJobsForBillingCreate(),
  ]);

  return (
    <DashboardLayout>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Billing</h1>
        <p className="mt-2 text-zinc-600">
          Internal billing foundation for requirement-level tracking.
        </p>
      </div>

      <div className="mt-8">
        <BillingRecordsPanel
          mode="admin"
          records={records}
          jobOptions={jobOptions}
          title="Billing records"
          description="Track billing status by company and requirement. No payment processing is available."
        />
      </div>
    </DashboardLayout>
  );
}
