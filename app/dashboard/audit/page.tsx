import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Audit log",
};

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { getAuditLogPage } from "@/lib/audit/audit-log";

type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditLogPage({ searchParams }: AuditPageProps) {
  const params = (await searchParams) ?? {};
  const pageValue = Array.isArray(params.page) ? params.page[0] : params.page;
  const companyValue = Array.isArray(params.companyId)
    ? params.companyId[0]
    : params.companyId;
  const page = Number(pageValue);
  const companyId = Number(companyValue);
  const result = await getAuditLogPage({
    page: Number.isInteger(page) ? page : 1,
    companyId: Number.isInteger(companyId) ? companyId : undefined,
  });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const companyQuery =
    Number.isInteger(companyId) && companyId > 0 ? `&companyId=${companyId}` : "";

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-black">Audit log</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Hire, rejection, stage changes, and team role or suspension events.
        Outcome history stays in the hiring record.
      </p>
      <form className="mt-4 flex gap-2" action="/dashboard/audit">
        <label className="text-sm text-zinc-700">
          Company id
          <input
            name="companyId"
            defaultValue={Number.isInteger(companyId) && companyId > 0 ? String(companyId) : ""}
            className="ml-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Filter
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-black">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-600" colSpan={7}>
                  No audit entries.
                </td>
              </tr>
            ) : (
              result.entries.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-200">
                  <td className="px-3 py-2">{entry.occurredAt.toISOString()}</td>
                  <td className="px-3 py-2">{entry.actorUserId ?? (entry.scimTokenId ? `SCIM credential #${entry.scimTokenId}` : "none")}</td>
                  <td className="px-3 py-2">{entry.actorRole}</td>
                  <td className="px-3 py-2">{entry.companyId}</td>
                  <td className="px-3 py-2">{entry.action}</td>
                  <td className="px-3 py-2">
                    {entry.targetType} {entry.targetId}
                  </td>
                  <td className="px-3 py-2">{entry.reason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-4 text-sm">
        {result.page > 1 ? (
          <Link href={`/dashboard/audit?page=${result.page - 1}${companyQuery}`}>
            Previous
          </Link>
        ) : null}
        <span>
          Page {result.page} of {pageCount}
        </span>
        {result.page < pageCount ? (
          <Link href={`/dashboard/audit?page=${result.page + 1}${companyQuery}`}>
            Next
          </Link>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
