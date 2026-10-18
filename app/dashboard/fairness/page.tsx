import Link from "next/link";

import { requireUser } from "@/lib/auth/authorization";
import { latestFairness } from "@/lib/fairness/monitor";
import { formatPValue } from "@/lib/fairness/impact";
import type { StageReport } from "@/lib/fairness/impact";

export const dynamic = "force-dynamic";

function percent(rate: number | null) {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function StageTable({ stage, title }: { stage: StageReport; title?: string }) {
  return (
    <section className="mt-4">
      <h3 className="font-semibold">{title ?? stage.stage}{stage.flagged ? " · Flagged" : ""}</h3>
      <p className="mt-1 text-sm text-zinc-800">{stage.note}</p>
      {stage.pValue != null && stage.flagged ? <p className="text-sm">Two-proportion p-value {formatPValue(stage.pValue)}.</p> : null}
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="py-1">Group</th>
            <th>People</th>
            <th>Passed</th>
            <th>Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {stage.groups.map((group) => (
            <tr key={group.group} className={stage.flagged ? "bg-amber-50" : undefined}>
              <td className="py-1">{group.group}</td>
              <td>{group.hidden ? "too few to show" : group.people}</td>
              <td>{group.hidden ? "too few to show" : group.passed}</td>
              <td>{group.hidden ? "too few to show" : percent(group.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function FairnessPage() {
  await requireUser();
  const reports = await latestFairness();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-zinc-900">
      <p className="text-sm"><Link className="font-semibold underline" href="/dashboard">Dashboard</Link></p>
      <h1 className="mt-4 text-2xl font-bold">Adverse-impact monitoring</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-800">
        A flag means one group’s pass rate is below four-fifths of the highest group’s rate, and both groups have at least 30 people.
        It does not change who moves forward. Counts under 10 are hidden. Self-identification is not shown to recruiters and is not used by the matcher.
      </p>
      {reports.length === 0 ? <p className="mt-6">No fairness snapshot yet. The nightly job creates one.</p> : null}
      {reports.map(({ company, snapshot, history }) => {
        const report = snapshot.report as {
          sections?: Array<{
            jobId: number;
            dimension: string;
            stages: StageReport[];
            requirement: { key: string; impactRatio: number } | null;
            overrides?: StageReport;
          }>;
          flags?: string[];
          sample?: boolean;
        };
        if (report.sample) return null;
        return (
          <section key={company.id} className="mt-8">
            <h2 className="text-xl font-bold">{company.name}</h2>
            <p className="text-sm">Snapshot {snapshot.computedAt.toLocaleString("en-IN")}. Flags: {(report.flags ?? []).length}.</p>
            <p className="mt-2 text-sm">Trend: {history.map((point) => {
              const flags = (point.report as { flags?: string[] }).flags?.length ?? 0;
              return `${point.computedAt.toLocaleDateString("en-IN")} (${flags})`;
            }).join(" · ")}</p>
            {(report.sections ?? []).map((section) => (
              <article key={`${section.jobId}-${section.dimension}`} className="mt-6 rounded-xl border border-zinc-300 p-4">
                <h3 className="text-lg font-bold">Job {section.jobId} · {section.dimension}</h3>
                {section.requirement ? (
                  <p className="mt-2 text-sm">
                    The widest gap is {section.requirement.key} (impact ratio {section.requirement.impactRatio.toFixed(2)}).
                    Review it, then edit or remove it in a new specification version.
                  </p>
                ) : null}
                {section.stages.filter((stage) => stage.flagged || stage.stage === "aiShortlist").map((stage) => (
                  <StageTable key={stage.stage} stage={stage} />
                ))}
                {section.overrides && section.overrides.groups.length > 0 ? (
                  <StageTable
                    title="Human overrides of AI grades"
                    stage={{
                      ...section.overrides,
                      note: section.overrides.flagged
                        ? section.overrides.note
                        : "Share of AI-graded answers that a person overrode. A higher rate means overrides are concentrated in that group. It does not change a candidate's outcome.",
                    }}
                  />
                ) : null}
                {section.requirement ? (
                  <form className="mt-3 flex flex-wrap gap-2" method="post" action="/dashboard/fairness/act">
                    <input type="hidden" name="companyId" value={String(company.id)} />
                    <input type="hidden" name="jobId" value={String(section.jobId)} />
                    <input type="hidden" name="requirementKey" value={section.requirement.key} />
                    <label className="sr-only" htmlFor={`reason-${section.jobId}-${section.dimension}`}>Reason for reviewing this requirement</label>
                    <input id={`reason-${section.jobId}-${section.dimension}`} name="reason" required placeholder="Why you are changing or keeping it" className="min-h-6 rounded border px-3 py-2 text-sm" />
                    <button className="min-h-6 rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white" type="submit">Record review</button>
                    <Link className="min-h-6 rounded border px-3 py-2 text-sm font-semibold" href={`/dashboard/jobs/${section.jobId}/review`}>Open the job</Link>
                  </form>
                ) : null}
              </article>
            ))}
          </section>
        );
      })}
    </main>
  );
}
