import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice",
};

import { notFound } from "next/navigation";
import Link from "next/link";

import BillingInvoice from "@/components/billing/BillingInvoice";
import PrintInvoiceButton from "@/components/billing/PrintInvoiceButton";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientBillingRecordById } from "@/lib/repositories/billing-repository";

export default async function ClientBillingInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/client/billing/${record.id}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to billing record
        </Link>
        <PrintInvoiceButton />
      </div>
      <BillingInvoice record={record} />
    </div>
  );
}
