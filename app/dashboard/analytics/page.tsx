import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { applyReportFilter, parseReportFilter } from "@/lib/analytics/nl-filters";
import { dropOff, sourceQuality, timeToHireDays } from "@/lib/analytics/recruiter-analytics";
import { translate } from "@/lib/i18n/catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RecruiterAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; q?: string }>;
}) {
  const params = await searchParams;
  const locale = params.lang === "hi" ? "hi" : "en";
  const admin = await requireAdmin();
  const applications = await prisma.application.findMany({
    where: admin.companyId == null || admin.platformOperator ? {} : { companyId: admin.companyId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      companyId: true,
      outcomeEvents: { where: { toStatus: "HIRED" }, select: { occurredAt: true }, take: 1 },
      ingestionEvents: { take: 1, orderBy: { id: "desc" }, select: { sourceChannel: true } },
    },
  });
  const visible = applications.filter((row) => admin.platformOperator || !deniesCrossCompany(admin, row.companyId));
  const events = visible.map((row) => ({
    applicationId: row.id,
    appliedAt: row.createdAt.toISOString(),
    hiredAt: row.outcomeEvents[0]?.occurredAt.toISOString() ?? (row.status === "HIRED" ? row.createdAt.toISOString() : null),
    status: row.status,
    source: row.ingestionEvents[0]?.sourceChannel ?? null,
  }));
  const parsed = params.q ? parseReportFilter(params.q) : null;
  const filtered = parsed?.filter ? applyReportFilter(events, parsed.filter) : events;
  const days = timeToHireDays(filtered);
  const stages = dropOff(filtered);
  const sources = sourceQuality(filtered);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">{translate(locale, "analyticsTitle").text}</h1>
      <p className="mt-2 text-sm text-zinc-600">{translate(locale, "analyticsIntro").text}</p>
      <form className="mt-4 flex flex-wrap items-center gap-2" action="/dashboard/analytics">
        <input type="hidden" name="lang" value={locale} />
        <label className="text-sm" htmlFor="report-q">{translate(locale, "filterLabel").text}</label>
        <input id="report-q" name="q" defaultValue={params.q ?? ""} placeholder={translate(locale, "filterPlaceholder").text} className="rounded border px-2 py-1 text-sm" />
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white" type="submit">Apply</button>
        <a className="text-sm underline" href={locale === "hi" ? "/dashboard/analytics" : "/dashboard/analytics?lang=hi"}>{locale === "hi" ? "English" : "हिन्दी"}</a>
      </form>
      {parsed?.refusal ? <p className="mt-3 text-sm text-red-700" role="alert">{parsed.refusal}</p> : null}
      <p className="mt-6 text-lg">Average time to hire: {days == null ? "No hires yet" : `${days} days`}</p>
      <h2 className="mt-8 font-semibold">Pipeline</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {stages.map((stage) => <li key={stage.status}>{stage.status}: {stage.count}</li>)}
      </ul>
      <h2 className="mt-8 font-semibold">Sources</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {sources.map((source) => (
          <li key={source.source}>{source.source}: {source.hired} hired of {source.people} ({Math.round(source.hireRate * 100)}%)</li>
        ))}
      </ul>
    </main>
  );
}
