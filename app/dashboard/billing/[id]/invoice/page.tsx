import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice",
};

import { notFound } from "next/navigation";
import Link from "next/link";

import BillingInvoice from "@/components/billing/BillingInvoice";
import PrintInvoiceButton from "@/components/billing/PrintInvoiceButton";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { requireAdmin } from "@/lib/auth/authorization";
import { getBillingRecordById } from "@/lib/repositories/billing-repository";

export default async function AdminBillingInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/dashboard/billing/${record.id}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to billing record
        </Link>
        <PrintInvoiceButton />
      </div>
      <BillingInvoice record={record} />
    </DashboardLayout>
  );
}
