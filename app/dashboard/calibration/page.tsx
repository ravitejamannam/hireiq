import Link from "next/link";

import { requireAdmin } from "@/lib/auth/authorization";
import { getCalibrationReport } from "@/lib/interviews/calibration-service";

export const dynamic = "force-dynamic";

const TENDENCY_STYLES: Record<string, string> = {
  CALIBRATED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  TENDS_STRICTER: "bg-sky-50 text-sky-700 ring-sky-600/20",
  TENDS_LENIENT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  INSUFFICIENT_DATA: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};

const TENDENCY_LABELS: Record<string, string> = {
  CALIBRATED: "Calibrated",
  TENDS_STRICTER: "Tends stricter",
  TENDS_LENIENT: "Tends lenient",
  INSUFFICIENT_DATA: "Not enough data",
};

function fmt(n: number) {
  return `${n.toFixed(1)}%`;
}

export default async function CalibrationPage() {
  await requireAdmin();
  const report = await getCalibrationReport();

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/dashboard/interviewers"
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          ← Interviewers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          Interviewer calibration
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Transparent scoring-tendency analysis across rubric-scored
          interviews. This is admin-only decision support — it never affects
          candidate ranking or hiring outcomes. Labels need at least{" "}
          {"5"} scored competencies per interviewer.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-500">Platform average</p>
          <h2 className="mt-3 text-4xl font-bold text-black">
            {report.platformAvgPercentage.toFixed(1)}%
          </h2>
          <p className="mt-1 text-xs text-zinc-400">mean normalized rubric score</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-500">Rubric-scored interviews</p>
          <h2 className="mt-3 text-4xl font-bold text-black">
            {report.totalRubricEvaluations}
          </h2>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-500">Interviewers with data</p>
          <h2 className="mt-3 text-4xl font-bold text-black">{report.interviewers.length}</h2>
        </article>
      </div>

      {report.interviewers.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No rubric-scored evaluations yet. Scores appear once interviewers
          complete structured rubrics.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr>
                {["Interviewer", "Interviews", "Scores", "Avg %", "vs Platform", "Tendency"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {report.interviewers.map((i) => (
                <tr key={i.interviewerId} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{i.interviewerName}</td>
                  <td className="px-4 py-3 text-zinc-700">{i.evaluationsRubricScored}</td>
                  <td className="px-4 py-3 text-zinc-700">{i.scoresCount}</td>
                  <td className="px-4 py-3 text-zinc-700">{fmt(i.avgPercentage)}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      i.deltaVsPlatform > 0 ? "text-emerald-600" : i.deltaVsPlatform < 0 ? "text-sky-700" : "text-zinc-500"
                    }`}
                  >
                    {i.deltaVsPlatform > 0 ? "+" : ""}
                    {i.deltaVsPlatform.toFixed(1)} pts
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        TENDENCY_STYLES[i.tendency]
                      }`}
                    >
                      {TENDENCY_LABELS[i.tendency]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.competencies.length > 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900">Platform averages by competency</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {report.competencies.map((c) => (
              <li key={c.competencyName} className="rounded-lg border border-zinc-100 px-4 py-3">
                <p className="text-sm font-medium text-zinc-800">{c.competencyName}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {c.samples} scores · avg {fmt(c.platformAvgPercentage)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
