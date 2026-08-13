"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BillingStatus } from "@prisma/client";

import {
  cancelBillingRecord,
  createBillingRecord,
  updateBillingRecordStatus,
} from "@/app/actions/billing-actions";
import {
  ALLOWED_BILLING_STATUS_TRANSITIONS,
  BILLING_STATUS_OPTIONS,
  formatBillingDateTime,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";

export type BillingRecordView = {
  id: number;
  status: BillingStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  company: { id: number; name: string };
  job: { id: number; title: string };
};

type JobOption = {
  id: number;
  title: string;
  company: { id: number; name: string };
};

type BillingRecordsPanelProps = {
  records: BillingRecordView[];
  mode: "admin" | "client";
  /** When set, create is scoped to this requirement (Admin only). */
  fixedJobId?: number;
  jobOptions?: JobOption[];
  title?: string;
  description?: string;
  showSearch?: boolean;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Billing record could not be updated.";
}

export default function BillingRecordsPanel({
  records,
  mode,
  fixedJobId,
  jobOptions = [],
  title = "Billing",
  description = "Internal billing foundation records. Payment processing is not available.",
  showSearch = true,
}: BillingRecordsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingStatus | "ALL">(
    "ALL",
  );
  const [selectedJobId, setSelectedJobId] = useState(
    fixedJobId ? String(fixedJobId) : "",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const availableStatuses = useMemo(() => {
    const present = new Set(records.map((record) => record.status));
    return BILLING_STATUS_OPTIONS.filter((status) => present.has(status));
  }, [records]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return records.filter((record) => {
      if (statusFilter !== "ALL" && record.status !== statusFilter) {
        return false;
      }

      if (!normalized) return true;

      const haystack = [
        record.company.name,
        record.job.title,
        getBillingStatusLabel(record.status),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [records, search, statusFilter]);

  function handleCreate() {
    const jobId = fixedJobId ?? Number(selectedJobId);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      setErrorMessage("Select a requirement.");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setBusy("create");

    startTransition(async () => {
      try {
        await createBillingRecord(jobId);
        setSuccessMessage("Billing record created.");
        if (!fixedJobId) {
          setSelectedJobId("");
        }
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleStatusChange(recordId: number, status: BillingStatus) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusy(`status-${recordId}`);

    startTransition(async () => {
      try {
        await updateBillingRecordStatus(recordId, status);
        setSuccessMessage("Billing status updated.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  function handleCancel(recordId: number) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusy(`cancel-${recordId}`);

    startTransition(async () => {
      try {
        await cancelBillingRecord(recordId);
        setSuccessMessage("Billing record cancelled.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div>
      <div>
        <h2 className="text-2xl font-bold text-black">{title}</h2>
        <p className="mt-2 text-sm text-zinc-600">{description}</p>
        <p className="mt-2 text-xs text-zinc-500">
          No payment gateway, card capture, or invoice delivery is available in
          this foundation.
        </p>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {successMessage}
        </div>
      ) : null}

      {mode === "admin" ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-black">
            Create billing record
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Company is derived from the selected requirement on the server.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            {fixedJobId ? (
              <p className="text-sm text-zinc-700">
                Requirement is fixed for this workspace.
              </p>
            ) : (
              <div className="min-w-[240px] flex-1">
                <label
                  htmlFor="billing-job"
                  className="block text-sm font-medium text-black"
                >
                  Requirement
                </label>
                <select
                  id="billing-job"
                  value={selectedJobId}
                  disabled={isPending}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
                >
                  <option value="">Select requirement</option>
                  {jobOptions.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} · {job.company.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={handleCreate}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {busy === "create" ? "Creating..." : "Create Billing Record"}
            </button>
          </div>
        </div>
      ) : null}

      {showSearch ? (
        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by company or requirement..."
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none focus:border-black"
          />
        </div>
      ) : null}

      {(showSearch || availableStatuses.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              statusFilter === "ALL"
                ? "bg-black text-white"
                : "border border-zinc-300 bg-white text-black hover:bg-zinc-100"
            }`}
          >
            All
          </button>
          {availableStatuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                statusFilter === status
                  ? "bg-black text-white"
                  : "border border-zinc-300 bg-white text-black hover:bg-zinc-100"
              }`}
            >
              {getBillingStatusLabel(status)}
            </button>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No billing records configured.
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            {mode === "admin"
              ? "Create a billing record to track requirement billing status."
              : "Billing status will appear here when configured by HireIQ."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No billing records match your filters.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Requirement</th>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                {mode === "admin" ? (
                  <th className="px-4 py-3 font-semibold">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id} className="border-b border-zinc-100">
                  <td className="px-4 py-3 font-medium text-black">
                    {mode === "admin" ? (
                      <Link
                        href={`/dashboard/billing/${record.id}`}
                        className="underline underline-offset-2 hover:text-zinc-700"
                      >
                        {record.job.title}
                      </Link>
                    ) : (
                      record.job.title
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {record.company.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {mode === "admin" && record.status !== "CANCELLED" ? (
                      <select
                        value={record.status}
                        disabled={isPending}
                        onChange={(event) =>
                          handleStatusChange(
                            record.id,
                            event.target.value as BillingStatus,
                          )
                        }
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                      >
                        {[
                          record.status,
                          ...ALLOWED_BILLING_STATUS_TRANSITIONS[record.status],
                        ].map((status) => (
                          <option key={status} value={status}>
                            {getBillingStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      getBillingStatusLabel(record.status)
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {formatBillingDateTime(record.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {formatBillingDateTime(record.updatedAt)}
                  </td>
                  {mode === "admin" ? (
                    <td className="px-4 py-3">
                      {record.status === "CANCELLED" ? (
                        <span className="text-xs text-zinc-500">Cancelled</span>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleCancel(record.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
                        >
                          {busy === `cancel-${record.id}`
                            ? "Cancelling..."
                            : "Cancel"}
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
