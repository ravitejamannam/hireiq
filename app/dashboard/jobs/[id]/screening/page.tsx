import Link from "next/link";
import { notFound } from "next/navigation";

import MustHavesForm from "@/components/screening/MustHavesForm";
import PendingCloseOutActions from "@/components/screening/PendingCloseOutActions";
import ScreeningPolicyForm from "@/components/screening/ScreeningPolicyForm";
import SpotCheckList from "@/components/screening/SpotCheckList";
import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { listCloseOuts } from "@/lib/screening/close-out-service";
import { listMustHaves } from "@/lib/screening/must-haves";
import { loadScreeningFairness } from "@/lib/screening/screening-fairness";
import { loadScreeningFunnel } from "@/lib/screening/screening-funnel";
import { listSpotChecks } from "@/lib/screening/spot-checks";
import { getCurrentScreeningPolicy, listScreeningPolicyVersions } from "@/lib/screening/screening-policy-service";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const WINDOWS = [30, 90, 365] as const;

function hours(value: number | null) {
  if (value === null) return "No data";
  return value < 48 ? `${value} h` : `${Math.round((value / 24) * 10) / 10} days`;
}

const FAIRNESS_FIELD_LABELS: Record<string, string> = { gender: "Gender", ageBand: "Age band", disability: "Disability", region: "Region" };

export default async function ScreeningSetupPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) notFound();
  const requested = Number(typeof query.window === "string" ? query.window : "90");
  const windowDays = (WINDOWS as readonly number[]).includes(requested) ? requested : 90;

  const [policy, versions, funnel, assessment, mustHaves, spotChecks, closeOuts, fairness] = await Promise.all([
    getCurrentScreeningPolicy(job.id, job.companyId),
    listScreeningPolicyVersions(job.id, job.companyId),
    loadScreeningFunnel(job.id, job.companyId, windowDays),
    prisma.generatedAssessment.findFirst({
      where: { jobId: job.id, companyId: job.companyId },
      orderBy: { version: "desc" },
      select: { status: true, version: true, timeLimitMinutes: true, drawCount: true },
    }),
    listMustHaves(job.id, job.companyId),
    listSpotChecks(job.id, job.companyId),
    listCloseOuts(job.id, job.companyId),
    loadScreeningFairness(job.id, job.companyId),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header>
        <p className="text-sm">
          <Link className="underline" href={`/dashboard/requirements/${job.id}`}>{job.title}</Link> ·{" "}
          <Link className="underline" href={`/dashboard/jobs/${job.id}/review`}>Review queue</Link> ·{" "}
          <Link className="underline" href={`/dashboard/jobs/${job.id}/assessment`}>Basic assessment</Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-black">Screening setup</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Weights decide how complete results combine into one number for ordering. Thresholds decide who meets the standard. Review capacity
          only limits how many qualified candidates appear in Top applicants (default 20). None of these reject anyone; a recruiter makes every decision.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Must-haves</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Three to five requirements the role cannot do without, each asked as a yes/no question on the application form.
        </p>
        <div className="mt-3">
          <MustHavesForm jobId={job.id} initial={mustHaves} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Basic assessment</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {assessment
            ? `Version ${assessment.version} (${assessment.status.toLowerCase()}): ${assessment.drawCount} questions per candidate, ${assessment.timeLimitMinutes} minutes.`
            : "No job-specific assessment yet. Candidates who applied through the hosted form may have the general role assessment."}{" "}
          <Link className="underline" href={`/dashboard/jobs/${job.id}/assessment`}>Edit assessment</Link>
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Scoring and practical</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {policy.version ? `Current version ${policy.version}.` : "These are suggested defaults and have not been saved for this job."} Saving creates a new version;
          earlier results keep the rubric they were graded on.
        </p>
        <div className="mt-4">
          <ScreeningPolicyForm
            jobId={job.id}
            initial={{
              basicWeight: policy.basicWeight,
              practicalWeight: policy.practicalWeight,
              evidenceWeight: policy.evidenceWeight,
              basicPassPercent: policy.basicPassPercent,
              practicalPassPercent: policy.practicalPassPercent,
              borderlineBandPercent: policy.borderlineBandPercent,
              reviewCapacity: policy.reviewCapacity,
              practicalTitle: policy.practicalTitle,
              practicalInstructions: policy.practicalInstructions,
              practicalEstimatedMinutes: policy.practicalEstimatedMinutes,
              practicalAllowedResources: policy.practicalAllowedResources,
              practicalDeadlineDays: policy.practicalDeadlineDays,
              practicalCompensationNote: policy.practicalCompensationNote,
              practicalRubric: policy.practicalRubric,
            }}
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Version history</h2>
        {versions.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr><th scope="col" className="py-1">Version</th><th scope="col">Weights (basic/practical/evidence)</th><th scope="col">Pass marks</th><th scope="col">Capacity</th><th scope="col">Saved</th></tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-t border-zinc-100">
                  <td className="py-1">v{version.version}</td>
                  <td>{version.basicWeight}/{version.practicalWeight}/{version.evidenceWeight}</td>
                  <td>{version.basicPassPercent ?? "—"} / {version.practicalPassPercent ?? "—"}</td>
                  <td>{version.reviewCapacity}</td>
                  <td>{version.createdAt.toLocaleString()} by {version.createdBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No saved versions.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Screening funnel</h2>
          <nav className="flex gap-2 text-sm" aria-label="Funnel window">
            {WINDOWS.map((days) => (
              <Link key={days} href={`/dashboard/jobs/${job.id}/screening?window=${days}`} className={days === windowDays ? "font-semibold" : "underline"}>
                {days} days
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Cohort: applications created since {funnel.since.toLocaleDateString()}. Each step counts what happened to that cohort, at any time. Rates
          use the denominator shown, and are blank when it is zero. Operational counts only; not a measure of candidate quality.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr><th scope="col" className="py-1">Step</th><th scope="col">Count</th><th scope="col">Rate</th><th scope="col">Of</th><th scope="col">Drop-off</th></tr>
          </thead>
          <tbody>
            {funnel.steps.map((row) => (
              <tr key={row.key} className="border-t border-zinc-100">
                <td className="py-1">{row.label}</td>
                <td className="tabular-nums">{row.count}</td>
                <td className="tabular-nums">{row.key === "applied" ? "" : row.rate === null ? "—" : `${row.rate}%`}</td>
                <td className="text-zinc-500">{row.key === "applied" ? "" : `${row.denominator} ${row.denominatorLabel}`}</td>
                <td className="tabular-nums text-zinc-500">{row.key === "applied" ? "" : row.dropOff}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-zinc-500">Median apply → basic submitted</dt><dd>{hours(funnel.medians.applyToBasicSubmitHours)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Median sent → basic submitted</dt><dd>{hours(funnel.medians.inviteToBasicSubmitHours)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Median assigned → practical submitted</dt><dd>{hours(funnel.medians.assignToPracticalSubmitHours)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Median basic assessment duration (start → submit)</dt><dd>{funnel.medians.basicDurationMinutes === null ? "No data" : `${funnel.medians.basicDurationMinutes} min`}</dd></div>
        </dl>
        <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
          <p className="font-semibold">
            {funnel.timeSaved.savedMinutes >= 0
              ? `Estimated recruiter time saved: ${Math.round(funnel.timeSaved.savedMinutes / 60)} h`
              : `Estimated extra recruiter time: ${Math.round(-funnel.timeSaved.savedMinutes / 60)} h`}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Estimate of recruiter labour, not a measurement. Baseline: {funnel.timeSaved.assumptions.manualScreenMinutesPerApplicant} min to screen each applicant by hand (
            {Math.round(funnel.timeSaved.baselineMinutes / 60)} h). Staged: {funnel.timeSaved.assumptions.manualScreenMinutesPerApplicant} min for each applicant
            with a recorded decision, {funnel.timeSaved.assumptions.practicalGradeMinutes} min per graded practical, and{" "}
            {funnel.timeSaved.assumptions.writtenGradeMinutesPerSubmission} min per basic assessment that still needed a human grader ({Math.round(funnel.timeSaved.stagedMinutes / 60)} h).
            Automatic scoring, waiting time, one-off setup and candidate time are not counted.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Weekly spot check</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Five applicants drawn at random each week from Possible fit, Weak evidence, Doesn&apos;t meet stated requirements, and anyone closed in a bulk
          close-out that week. A person re-reads each one. {spotChecks.reviewed > 0 ? `${spotChecks.reconsider} of ${spotChecks.reviewed} reviewed in the last 4 weeks were marked for reconsideration.` : ""}
        </p>
        <SpotCheckList
          jobId={job.id}
          rows={spotChecks.rows.map((row) => ({
            id: row.id,
            weekStart: row.weekStart.toISOString(),
            source: row.sourceCategory,
            applicationId: row.application.id,
            name: row.application.candidate.name,
            status: row.application.status,
            reviewedAt: row.reviewedAt?.toISOString() ?? null,
            outcome: row.outcome,
            note: row.note,
          }))}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Close-outs</h2>
        {closeOuts.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr><th scope="col" className="py-1">#</th><th scope="col">Scope</th><th scope="col">Candidates</th><th scope="col">Reason</th><th scope="col">Proposed</th><th scope="col">Outcome</th></tr>
            </thead>
            <tbody>
              {closeOuts.map((row) => {
                const result = row.result as { closed?: number; skipped?: unknown[] } | null;
                return (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="py-1">{row.id}</td>
                    <td>{row.category.replace(/_/g, " ").toLowerCase()}</td>
                    <td>{row.count}</td>
                    <td>{row.reason}</td>
                    <td>{row.proposedAt.toLocaleString()}</td>
                    <td>
                      {row.approvedAt
                        ? `Approved ${row.approvedAt.toLocaleString()}: ${result?.closed ?? 0} closed, ${result?.skipped?.length ?? 0} skipped`
                        : row.cancelledAt
                          ? "Cancelled"
                          : <PendingCloseOutActions jobId={job.id} batchId={row.id} count={row.count} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No close-outs. Propose one from the review queue; it needs a separate approval before anyone is closed.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Fairness check (four-fifths)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Uses voluntary self-identification only ({fairness?.selfIdentified ?? 0} of {fairness?.applicants ?? 0} applicants), shown in aggregate. Groups under 10
          people are hidden and only groups of 30 or more are compared. A flag is a prompt to inspect that stage; it changes no candidate&apos;s outcome.
        </p>
        {fairness
          ? fairness.dimensions.map((dimension) => (
              <div key={dimension.field} className="mt-3">
                <h3 className="text-sm font-semibold">{FAIRNESS_FIELD_LABELS[dimension.field] ?? dimension.field}</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {dimension.stages.map((stage) => (
                    <li key={stage.key}>
                      {stage.label} (of {stage.base}):{" "}
                      {stage.result.limitation
                        ? <span className="text-zinc-500">{stage.result.limitation}</span>
                        : stage.result.flagged
                          ? <span className="font-semibold text-amber-800">ratio {stage.result.impactRatio} between {stage.result.compared?.join(" and ")}. Below 0.8; inspect this stage.</span>
                          : <span>ratio {stage.result.impactRatio}, not flagged.</span>}
                      {stage.result.undisclosed > 0 ? <span className="text-xs text-zinc-500"> {stage.result.undisclosed} did not disclose.</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          : null}
      </section>
    </main>
  );
}
