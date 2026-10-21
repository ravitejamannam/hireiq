"use client";

import { useState } from "react";

import {
  createInboundRouteAction,
  retryInboundMessageAction,
  setInboundRouteEnabledAction,
} from "@/app/actions/inbound-email-actions";

type Route = { id: number; enabled: boolean; address: string | null; configured: boolean } | null;
type Message = {
  id: number;
  status: string;
  code: string | null;
  applicantName: string | null;
  emailMasked: string | null;
  attachmentCount: number;
  applicationId: number | null;
};

export default function InboundEmailPanel({
  jobId,
  configured,
  route,
  messages,
}: {
  jobId: number;
  configured: boolean;
  route: Route;
  messages: Message[];
}) {
  const [address, setAddress] = useState(route?.address ?? null);
  const [enabled, setEnabled] = useState(route?.enabled ?? false);
  const [rows, setRows] = useState(messages);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold">Inbound applicant email</h2>
        <p className="mt-1 text-sm text-zinc-600">
          This address accepts signed webhook deliveries for this job only. It is not a live mailbox
          provider, and receiving a resume does not record consent.
        </p>
        {!configured ? (
          <p className="mt-3 text-sm text-amber-800" role="status">
            Inbound email is not configured. Set INBOUND_EMAIL_DOMAIN and INBOUND_EMAIL_WEBHOOK_SECRET.
          </p>
        ) : null}
        {address ? (
          <p className="mt-3 break-all font-mono text-sm">{address}</p>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No address is available to copy.</p>
        )}
        <p className="mt-2 text-sm">{enabled ? "Route enabled." : "Route disabled."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!configured}
            onClick={() => {
              setError(null);
              void createInboundRouteAction(jobId).then((result) => {
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                if (result.route.address) setAddress(result.route.address);
                setEnabled(result.route.enabled);
                setNotice(result.created ? "Route created. Copy the address now." : "Route already exists.");
              });
            }}
          >
            Create routing address
          </button>
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
            onClick={() => {
              void setInboundRouteEnabledAction(jobId, !enabled).then((result) => {
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEnabled(result.route.enabled);
              });
            }}
          >
            {enabled ? "Disable route" : "Enable route"}
          </button>
        </div>
      </section>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6" aria-live="polite">
        <h2 className="text-lg font-bold">Processing</h2>
        {rows.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No inbound messages.</p> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-2">
              <span>
                {row.applicantName ?? "Unknown"} {row.emailMasked ? `(${row.emailMasked})` : ""} — {row.status}{" "}
                {row.code ?? ""} {row.applicationId ? `application ${row.applicationId}` : ""}
              </span>
              {row.status === "FAILED" ? (
                <button
                  type="button"
                  className="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    void retryInboundMessageAction(jobId, row.id).then((result) => {
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: result.message.status, code: result.message.code } : item));
                    });
                  }}
                >
                  Retry
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
