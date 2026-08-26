import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * T139: aggregate-only equity reporting (Greenhouse-style self-ID).
 *
 * Privacy rules baked in:
 *  - counts only; no individual rows are ever exposed
 *  - small-cell suppression: any category with fewer than 5 responses
 *    is merged into "Suppressed" to prevent re-identification
 *  - only consented submissions are counted
 */

const MIN_CELL = 5;

const LABELS: Record<string, string> = {
  WOMAN: "Woman",
  MAN: "Man",
  NON_BINARY: "Non-binary",
  SELF_DESCRIBE: "Self-described",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export default async function EquityReportingPage() {
  await requireAdmin();
  noStore();

  const submissions = await prisma.hostedApplySubmission.findMany({
    where: { selfIdConsentedAt: { not: null }, selfIdGender: { not: null } },
    select: {
      selfIdGender: true,
      job: {
        select: { id: true, title: true },
      },
    },
  });

  // Aggregate per job.
  const perJob = new Map<number, { title: string; counts: Record<string, number> }>();
  const totals: Record<string, number> = {};

  for (const s of submissions) {
    const gender = s.selfIdGender ?? "";
    const entry = perJob.get(s.job.id) ?? { title: s.job.title, counts: {} };
    entry.counts[gender] = (entry.counts[gender] ?? 0) + 1;
    perJob.set(s.job.id, entry);
    totals[gender] = (totals[gender] ?? 0) + 1;
  }

  function renderRow(counts: Record<string, number>) {
    const categories = Object.keys(LABELS);
    return categories.map((cat) => {
      const n = counts[cat] ?? 0;
      return (
        <td key={cat} className="px-3 py-2 text-center">
          {n === 0 ? (
            <span className="text-zinc-300">—</span>
          ) : n < MIN_CELL ? (
            <span
              className="italic text-zinc-400"
              title="Suppressed: fewer than 5 responses"
            >
              &lt;{MIN_CELL}
            </span>
          ) : (
            <span className="font-medium text-zinc-900">{n}</span>
          )}
        </td>
      );
    });
  }

  const jobsWithResponses = [...perJob.entries()].filter(
    ([, v]) => Object.values(v.counts).some((n) => n >= MIN_CELL),
  );

  return (
    <DashboardLayout>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Insights
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Equity reporting</h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          Aggregate view of voluntary candidate self-identification at apply.
          Individual answers are never shown — any category with fewer than{" "}
          {MIN_CELL} responses is suppressed to protect anonymity.
        </p>
      </div>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">All requirements</h2>
        <table className="mt-4 min-w-full divide-y divide-zinc-200 text-sm">
          <thead>
            <tr className="bg-zinc-50">
              <th className="px-3 py-2 text-left font-medium text-zinc-500">
                Category
              </th>
              <th className="px-3 py-2 text-center font-medium text-zinc-500">
                Responses
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {Object.entries(LABELS).map(([key, label]) => {
              const n = totals[key] ?? 0;
              return (
                <tr key={key}>
                  <td className="px-3 py-2 text-zinc-700">{label}</td>
                  <td className="px-3 py-2 text-center">
                    {n === 0 ? (
                      <span className="text-zinc-300">—</span>
                    ) : n < MIN_CELL ? (
                      <span className="italic text-zinc-400">&lt;{MIN_CELL}</span>
                    ) : (
                      <span className="font-medium text-black">{n}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-zinc-400">
          {submissions.length} voluntary response{submissions.length === 1 ? "" : "s"} collected.
        </p>
      </section>

      {jobsWithResponses.length > 0 && (
        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-bold text-black">By requirement</h2>
          <table className="mt-4 min-w-full divide-y divide-zinc-200 text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="px-3 py-2 text-left font-medium text-zinc-500">
                  Requirement
                </th>
                {Object.values(LABELS).map((label) => (
                  <th key={label} className="px-3 py-2 text-center font-medium text-zinc-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {jobsWithResponses.map(([jobId, v]) => (
                <tr key={jobId}>
                  <td className="max-w-xs truncate px-3 py-2 text-zinc-700">
                    <Link href={`/dashboard/requirements/${jobId}`} className="underline underline-offset-2 hover:text-black">
                      {v.title}
                    </Link>
                  </td>
                  {renderRow(v.counts)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </DashboardLayout>
  );
}
