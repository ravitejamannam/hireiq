"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BillingStatus } from "@prisma/client";

import {
  cancelBillingRecord,
  updateBillingRecordStatus,
} from "@/app/actions/billing-actions";
import {
  ALLOWED_BILLING_STATUS_TRANSITIONS,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";

type BillingAdminStatusControlsProps = {
  recordId: number;
  status: BillingStatus;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Billing record could not be updated.";
}

export default function BillingAdminStatusControls({
  recordId,
  status,
}: BillingAdminStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "cancel" | null>(null);

  function handleStatusChange(nextStatus: BillingStatus) {
    setErrorMessage(null);
    setBusy("status");

    startTransition(async () => {
      try {
        await updateBillingRecordStatus(recordId, nextStatus);
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleCancel() {
    setErrorMessage(null);
    setBusy("cancel");

    startTransition(async () => {
      try {
        await cancelBillingRecord(recordId);
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  if (status === "CANCELLED") {
    return <span className="text-xs text-zinc-500">Cancelled</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {errorMessage ? (
        <p role="alert" className="text-xs text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          disabled={isPending}
          aria-label="Billing status"
          onChange={(event) =>
            handleStatusChange(event.target.value as BillingStatus)
          }
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
        >
          {[status, ...ALLOWED_BILLING_STATUS_TRANSITIONS[status]].map(
            (option) => (
              <option key={option} value={option}>
                {getBillingStatusLabel(option)}
              </option>
            ),
          )}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={handleCancel}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
        >
          {busy === "cancel" ? "Cancelling..." : "Cancel"}
        </button>
      </div>
    </div>
  );
}
