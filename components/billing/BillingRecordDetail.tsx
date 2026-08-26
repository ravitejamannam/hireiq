import type { ReactNode } from "react";
import Link from "next/link";
import type { RequirementLifecycle } from "@prisma/client";

import BillingLineItems from "@/components/billing/BillingLineItems";
import {
  formatBillingDateTime,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";
import type { BillingRecordView } from "@/components/billing/billing-types";
import { requirementLifecycleLabels } from "@/components/jobs/JobCard";

type BillingRecordDetailProps = {
  record: BillingRecordView;
  requirementHref: string;
  candidateHref?: (applicationId: number) => string | null;
  manageSlot?: ReactNode;
  showAdminControls?: boolean;
};

function getBillingLifecycleLabel(lifecycle: RequirementLifecycle) {
  return requirementLifecycleLabels[lifecycle] ?? lifecycle;
}

export default function BillingRecordDetail({
  record,
  requirementHref,
  candidateHref,
  manageSlot,
  showAdminControls = false,
}: BillingRecordDetailProps) {
  return (
    <>
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-xs text-zinc-500">
          Billing is generated after hire confirmation. No payment amounts,
          taxes, or gateway data are stored.
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
                href={requirementHref}
                className="font-medium text-black underline underline-offset-2"
              >
                {record.job.title}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Billing lifecycle</dt>
            <dd>{getBillingLifecycleLabel(record.job.requirementLifecycle)}</dd>
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
        {manageSlot ? <div className="mt-6">{manageSlot}</div> : null}
      </section>

      <BillingLineItems
        lineItems={record.lineItems}
        candidateHref={candidateHref}
        showAdminControls={showAdminControls}
      />
    </>
  );
}
