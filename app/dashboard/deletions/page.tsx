import Link from "next/link";

import { requireUser } from "@/lib/auth/authorization";
import { deletionIsOverdue, listDeletionRequests } from "@/lib/privacy/deletion-queue";

export const dynamic = "force-dynamic";

export default async function DeletionQueuePage() {
  await requireUser();
  const rows = await listDeletionRequests();
  const open = rows.filter((row) => row.status === "QUEUED");
  const overdue = open.filter((row) => deletionIsOverdue(row)).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-zinc-900">
      <p className="text-sm">
        <Link className="font-semibold underline" href="/dashboard">
          Dashboard
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold">Deletion requests</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-800">
        The DPDP Act requires erasure when a candidate asks, unless the law says to keep the record.
        Finish each request within two weeks. Ninety days is only the overdue alarm, the grievance ceiling in the DPDP Rules, 2025, rule 14(3).
        {overdue > 0 ? ` ${overdue} ${overdue === 1 ? "is" : "are"} past that ceiling.` : ""}
      </p>
      {rows.length === 0 ? <p className="mt-6">No deletion requests.</p> : null}
      <ul className="mt-6 space-y-4">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-zinc-300 p-4">
            <p className="font-semibold">
              {row.candidate.name} · {row.company.name}
              {row.application ? ` · ${row.application.job.title}` : ""}
            </p>
            <p className="mt-1 text-sm">
              {row.emailNormalized} · {row.status}
              {row.overdue ? " · Overdue" : row.pastAim ? " · Past the two-week aim" : ""}
            </p>
            <p className="text-sm">
              Aim to finish by {row.targetAt.toLocaleDateString("en-IN", { timeZone: "UTC" })} (UTC). Overdue alarm {row.ceilingAt.toLocaleDateString("en-IN", { timeZone: "UTC" })} (UTC).
            </p>
            {row.decisionReason ? <p className="mt-1 text-sm">{row.decisionReason}</p> : null}
            {row.status === "QUEUED" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <form method="post" action="/dashboard/deletions/act">
                  <input type="hidden" name="intent" value="complete" />
                  <input type="hidden" name="requestId" value={String(row.id)} />
                  <button className="min-h-6 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white" type="submit">
                    Erase personal data
                  </button>
                </form>
                <form method="post" action="/dashboard/deletions/act" className="flex flex-wrap gap-2">
                  <input type="hidden" name="intent" value="retain" />
                  <input type="hidden" name="requestId" value={String(row.id)} />
                  <label className="sr-only" htmlFor={`reason-${row.id}`}>
                    Why this record must be kept
                  </label>
                  <input
                    id={`reason-${row.id}`}
                    name="reason"
                    required
                    placeholder="Law that requires retention"
                    className="min-h-6 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                  <button className="min-h-6 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold" type="submit">
                    Keep for a legal reason
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
