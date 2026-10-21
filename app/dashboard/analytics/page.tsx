import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { attributionEvent, channelDateRange, intakeMethod } from "@/lib/analytics/channel-analytics";
import { loadChannelAnalytics } from "@/lib/analytics/channel-analytics-service";
import { applyReportFilter, parseReportFilter } from "@/lib/analytics/nl-filters";
import { dropOff, sourceQuality, timeToHireDays } from "@/lib/analytics/recruiter-analytics";
import { translate } from "@/lib/i18n/catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RecruiterAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; q?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const locale = params.lang === "hi" ? "hi" : "en";
  const admin = await requireAdmin();
  const range = channelDateRange(params.from, params.to);
  const channel = admin.companyId != null && !range.error
    ? await loadChannelAnalytics({ companyId: admin.companyId, from: range.from, to: range.to })
    : null;
  const applications = await prisma.application.findMany({
    where: admin.companyId == null || admin.platformOperator ? {} : { companyId: admin.companyId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      companyId: true,
      outcomeEvents: { where: { toStatus: "HIRED" }, select: { occurredAt: true }, take: 1 },
      ingestionEvents: {
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          receivedAt: true,
          status: true,
          sourceChannel: true,
          externalApplicationId: true,
          distributionId: true,
        },
      },
    },
  });
  const visible = applications.filter((row) => admin.platformOperator || !deniesCrossCompany(admin, row.companyId));
  const events = visible.map((row) => {
    const attributed = attributionEvent(row.ingestionEvents);
    return {
      applicationId: row.id,
      appliedAt: row.createdAt.toISOString(),
      hiredAt: row.outcomeEvents[0]?.occurredAt.toISOString() ?? (row.status === "HIRED" ? row.createdAt.toISOString() : null),
      status: row.status,
      source: attributed?.sourceChannel ?? null,
      intake: intakeMethod(attributed),
    };
  });
  const parsed = params.q ? parseReportFilter(params.q) : null;
  const filtered = parsed?.filter ? applyReportFilter(events, parsed.filter) : events;
  const days = timeToHireDays(filtered);
  const stages = dropOff(filtered);
  const sources = sourceQuality(filtered.map((row) => ({ ...row, source: row.intake })));
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
      <h2 className="mt-8 font-semibold">Channel performance</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Each row is an intake method. CSV import and inbound email are not the original job board, and they are not manual entry.
        Consented means a consent time is stored. Job views, campaign values, and channel costs are not recorded.
      </p>
      <form className="mt-3 flex flex-wrap items-end gap-2" action="/dashboard/analytics">
        <input type="hidden" name="lang" value={locale} />
        {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
        <label className="text-sm" htmlFor="channel-from">From
          <input id="channel-from" name="from" type="date" defaultValue={params.from ?? ""} className="mt-1 block rounded border px-2 py-1" />
        </label>
        <label className="text-sm" htmlFor="channel-to">To
          <input id="channel-to" name="to" type="date" defaultValue={params.to ?? ""} className="mt-1 block rounded border px-2 py-1" />
        </label>
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white" type="submit">Filter</button>
      </form>
      {range.error ? <p className="mt-3 text-sm text-red-700" role="alert">{range.error}</p> : null}
      {admin.companyId == null ? (
        <p className="mt-3 text-sm text-zinc-600">Channel counts stay inside one company. This account is not scoped to a company.</p>
      ) : null}
      {channel && channel.rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">No applications in this range.</p>
      ) : null}
      {channel && channel.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Applications by intake method</caption>
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-2 pr-3">Intake</th>
                <th className="py-2 pr-3">Applications</th>
                <th className="py-2 pr-3">Candidates</th>
                <th className="py-2 pr-3">Consented</th>
                <th className="py-2 pr-3">Past CV pool</th>
                <th className="py-2 pr-3">Interviews</th>
                <th className="py-2 pr-3">Hires</th>
                <th className="py-2">Board source recorded</th>
              </tr>
            </thead>
            <tbody>
              {channel.rows.map((row) => (
                <tr key={row.intake} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">{row.intake}</td>
                  <td className="py-2 pr-3">{row.applications}</td>
                  <td className="py-2 pr-3">{row.candidates}</td>
                  <td className="py-2 pr-3">{row.consented}</td>
                  <td className="py-2 pr-3">{row.advanced}</td>
                  <td className="py-2 pr-3">{row.interviews}</td>
                  <td className="py-2 pr-3">{row.hires}</td>
                  <td className="py-2">{row.recordedBoardSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">
            {channel.totals.applications} applications from {channel.totals.candidates} candidates.
            A person with two applications is counted once in the total and once in each intake row they used.
            {channel.unavailable.views} {channel.unavailable.cost} {channel.unavailable.campaign}
          </p>
        </div>
      ) : null}
      <h2 className="mt-8 font-semibold">Sources</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {sources.map((source) => (
          <li key={source.source}>{source.source}: {source.hired} hired of {source.people} ({Math.round(source.hireRate * 100)}%)</li>
        ))}
      </ul>
    </main>
  );
}
