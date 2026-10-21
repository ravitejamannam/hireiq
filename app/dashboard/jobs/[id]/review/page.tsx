import { notFound } from "next/navigation";

import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { PastCandidates } from "@/components/review/PastCandidates";
import ReviewQueue from "@/components/review/ReviewQueue";
import { reviewApplicationDetail } from "@/lib/review/review-queue-service";
import { loadScreeningPool, parseScreeningQuery, queryScreeningPool } from "@/lib/screening/screening-data";
import { loadTalentRediscovery } from "@/lib/talent/rediscovery-service";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FLAG_OPTIONS = [
  ["PENDING_HUMAN_GRADING", "Needs grading"],
  ["HUMAN_REVIEW_REQUESTED", "Human review requested"],
  ["ELIGIBILITY_UNVERIFIED", "Eligibility unverified"],
  ["REQUIRED_NOT_MET", "Essential requirement not met"],
  ["KNOCKOUT_FAILED", "Failed knockout"],
  ["NEAR_THRESHOLD", "Near threshold"],
  ["COMPONENT_DISAGREEMENT", "Results disagree"],
  ["STRONG_PRACTICAL_SPARSE_EVIDENCE", "Strong practical, sparse resume"],
  ["BASIC_INCOMPARABLE", "Different assessment version"],
  ["PRACTICAL_INCOMPARABLE", "Different rubric version"],
  ["CLOSE_TO_NEIGHBOUR", "Close to neighbour"],
  ["ASSESSMENT_EXPIRED", "Assessment expired"],
  ["PRACTICAL_OVERDUE", "Practical overdue"],
  ["PARSE_ISSUE", "Resume parse issue"],
  ["AI_OPT_OUT", "Opted out of AI"],
] as const;

export default async function JobReviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const raw = await searchParams;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();
  const admin = await requireAdmin();
  const owned = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!owned || deniesCrossCompany(admin, owned.companyId)) notFound();
  const tab = typeof raw.tab === "string" ? raw.tab : "";

  if (tab === "past") {
    const past = await loadTalentRediscovery(jobId);
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <nav className="mb-4 flex gap-3 text-sm" aria-label="Review">
          <a className="underline" href={`/dashboard/jobs/${jobId}/review`}>Current applicants</a>
          <a className="font-semibold" href={`/dashboard/jobs/${jobId}/review?tab=past`}>Past candidates</a>
        </nav>
        <PastCandidates jobId={jobId} hits={past.results as never} />
        <CopilotPanel jobId={jobId} companyId={owned.companyId} />
      </main>
    );
  }

  const query = parseScreeningQuery(raw);
  const [pool, publishedAssessment] = await Promise.all([
    loadScreeningPool(jobId, owned.companyId),
    prisma.generatedAssessment.findFirst({ where: { jobId, companyId: owned.companyId, status: "PUBLISHED" }, select: { id: true } }),
  ]);
  if (!pool) notFound();
  const result = queryScreeningPool(pool, query);
  const selectedRaw = Number(typeof raw.selected === "string" ? raw.selected : "");
  const selected = Number.isInteger(selectedRaw) && pool.rows.some((row) => row.applicationId === selectedRaw) ? selectedRaw : result.rows[0]?.applicationId ?? 0;
  const detail = selected ? await reviewApplicationDetail({ applicationId: selected, companyId: owned.companyId }) : null;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({
    view: query.view,
    sort: query.sort === "priority" ? "" : query.sort,
    stage: query.stage,
    flag: query.flag,
    q: query.search,
    page: result.page > 1 ? String(result.page) : "",
    selected: selected ? String(selected) : "",
  })) {
    if (value) search.set(key, value);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-4 flex gap-3 text-sm" aria-label="Review">
        <a className="font-semibold" href={`/dashboard/jobs/${jobId}/review`}>Current applicants</a>
        <a className="underline" href={`/dashboard/jobs/${jobId}/review?tab=past`}>Past candidates</a>
      </nav>
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" action={`/dashboard/jobs/${jobId}/review`}>
        <input type="hidden" name="view" value={query.view} />
        <label className="flex flex-col">
          <span className="text-xs text-zinc-500">Search</span>
          <input name="q" defaultValue={query.search} placeholder="Name, title, employer" className="w-48 rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-zinc-500">Stage</span>
          <select name="stage" defaultValue={query.stage} className="rounded border px-2 py-1">
            <option value="">All stages</option>
            {["CV_POOL", "EXPERT_REVIEW", "TECH_EVALUATION", "SHORTLISTED", "HIRED", "REJECTED"].map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, " ").toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-zinc-500">Flag</span>
          <select name="flag" defaultValue={query.flag} className="rounded border px-2 py-1">
            <option value="">Any</option>
            {FLAG_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-zinc-500">Sort</span>
          <select name="sort" defaultValue={query.sort} className="rounded border px-2 py-1">
            <option value="priority">Rank (combined score)</option>
            <option value="practical">Practical</option>
            <option value="basic">Basic assessment</option>
            <option value="evidence">Evidence</option>
            <option value="applied">Newest applicants</option>
            <option value="name">Name</option>
          </select>
        </label>
        <button className="rounded bg-zinc-900 px-3 py-1 text-white" type="submit">Apply</button>
      </form>
      <ReviewQueue
        key={`${query.view}-${result.page}-${query.sort}`}
        jobId={jobId}
        jobTitle={pool.job.title}
        rows={result.rows}
        summary={pool.summary}
        detail={detail}
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        view={query.view}
        query={search.toString()}
        truncated={pool.truncated}
        evidenceSource={pool.evidenceSource}
        hasPublishedAssessment={Boolean(publishedAssessment)}
        hasPractical={Boolean(pool.policy.id && pool.policy.practicalTitle && pool.policy.practicalRubric.length > 0)}
      />
      <CopilotPanel jobId={jobId} companyId={owned.companyId} />
    </main>
  );
}
