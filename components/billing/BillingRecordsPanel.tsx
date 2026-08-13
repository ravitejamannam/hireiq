"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BillingStatus } from "@prisma/client";

import BillingAdminStatusControls from "@/components/billing/BillingAdminStatusControls";
import {
  BILLING_GENERATED_AFTER_HIRE,
  BILLING_STATUS_OPTIONS,
  formatBillingDateTime,
  formatHiredCandidateCount,
  getBillingRecordHref,
  getBillingStatusLabel,
} from "@/components/billing/billing-labels";
import type { BillingRecordView } from "@/components/billing/billing-types";

export type { BillingRecordView };

type BillingRecordsPanelProps = {
  records: BillingRecordView[];
  mode: "admin" | "client";
  title?: string;
  description?: string;
  showSearch?: boolean;
};

export default function BillingRecordsPanel({
  records,
  mode,
  title = "Billing",
  description = "Billing records generated after hire confirmation. Payment processing is not available.",
  showSearch = true,
}: BillingRecordsPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BillingStatus | "ALL">(
    "ALL",
  );

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
        ...record.lineItems.map((item) => item.application.candidate.name),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [records, search, statusFilter]);

  return (
    <div>
      <div>
        <h2 className="text-2xl font-bold text-black">{title}</h2>
        <p className="mt-2 text-sm text-zinc-600">{description}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {BILLING_GENERATED_AFTER_HIRE}. No payment gateway, card capture, or
          invoice delivery is available.
        </p>
      </div>

      {showSearch ? (
        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by company, requirement, or hired candidate..."
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
            No billing records yet.
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Billing is generated after hire confirmation. Selected candidates
            do not generate billing.
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
                {mode === "admin" ? (
                  <th className="px-4 py-3 font-semibold">Client</th>
                ) : null}
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Hired candidates</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                {mode === "admin" ? (
                  <th className="px-4 py-3 font-semibold">Updated</th>
                ) : null}
                {mode === "admin" ? (
                  <th className="px-4 py-3 font-semibold">Manage</th>
                ) : null}
                <th className="px-4 py-3 font-semibold">View</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const detailHref = getBillingRecordHref(mode, record.id);

                return (
                  <tr key={record.id} className="border-b border-zinc-100">
                    <td className="px-4 py-3 font-medium text-black">
                      <Link
                        href={detailHref}
                        className="underline underline-offset-2 hover:text-zinc-700"
                      >
                        {record.job.title}
                      </Link>
                    </td>
                    {mode === "admin" ? (
                      <td className="px-4 py-3 text-zinc-700">
                        {record.company.name}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-zinc-700">
                      {getBillingStatusLabel(record.status)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatHiredCandidateCount(record.lineItems.length)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {formatBillingDateTime(record.createdAt)}
                    </td>
                    {mode === "admin" ? (
                      <td className="px-4 py-3 text-zinc-600">
                        {formatBillingDateTime(record.updatedAt)}
                      </td>
                    ) : null}
                    {mode === "admin" ? (
                      <td className="px-4 py-3">
                        <BillingAdminStatusControls
                          recordId={record.id}
                          status={record.status}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <Link
                        href={detailHref}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
