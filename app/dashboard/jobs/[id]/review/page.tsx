import { notFound } from "next/navigation";

import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { PastCandidates } from "@/components/review/PastCandidates";
import ReviewQueue from "@/components/review/ReviewQueue";
import { listReviewQueue, reviewApplicationDetail } from "@/lib/review/review-queue-service";
import { loadTalentRediscovery } from "@/lib/talent/rediscovery-service";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function JobReviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();
  const admin = await requireAdmin();
  const owned = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!owned || deniesCrossCompany(admin, owned.companyId)) notFound();
  const filters = {
    stage: one(query.stage),
    minScore: one(query.minScore),
    maxScore: one(query.maxScore),
    knockout: one(query.knockout),
    parse: one(query.parse),
    human: one(query.human),
  };
  const page = Number(one(query.page) || "1");
  const tab = one(query.tab);
  let queue;
  try {
    queue = await listReviewQueue({ jobId, filters, page });
  } catch (error) {
    console.error("[review-queue]", error);
    notFound();
  }
  const selected = Number(one(query.selected) || queue.rows[0]?.id || 0);
  const detail = selected ? await reviewApplicationDetail({ applicationId: selected, companyId: queue.job.companyId }) : null;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page: String(page), selected: selected ? String(selected) : "" })) {
    if (value) search.set(key, value);
  }

  const past = tab === "past" ? await loadTalentRediscovery(jobId) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <nav className="mb-4 flex gap-3 text-sm" aria-label="Review">
        <a className={tab === "past" ? "underline" : "font-semibold"} href={`/dashboard/jobs/${jobId}/review`}>Current applicants</a>
        <a className={tab === "past" ? "font-semibold" : "underline"} href={`/dashboard/jobs/${jobId}/review?tab=past`}>Past candidates</a>
      </nav>
      {past ? <PastCandidates jobId={jobId} hits={past.results as never} /> : null}
      {past ? null : (
      <>
      <form className="mb-4 flex flex-wrap gap-2 text-sm" action={`/dashboard/jobs/${jobId}/review`}>
        <select name="stage" defaultValue={filters.stage} aria-label="Stage">
          <option value="">All stages</option>
          {["CV_POOL", "EXPERT_REVIEW", "TECH_EVALUATION", "SHORTLISTED", "REJECTED"].map((status) => <option key={status}>{status}</option>)}
        </select>
        <input name="minScore" defaultValue={filters.minScore} placeholder="Min score" aria-label="Minimum score" className="w-24 rounded border px-2 py-1" />
        <input name="maxScore" defaultValue={filters.maxScore} placeholder="Max score" aria-label="Maximum score" className="w-24 rounded border px-2 py-1" />
        <select name="knockout" defaultValue={filters.knockout} aria-label="Knockout">
          <option value="">Knockout</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
          <option value="unanswered">Unanswered</option>
        </select>
        <select name="parse" defaultValue={filters.parse} aria-label="Parse status">
          <option value="">Parse status</option>
          <option value="ok">Parsed</option>
          <option value="LOW_QUALITY">LOW_QUALITY</option>
          <option value="OCR_DEFERRED">OCR_DEFERRED</option>
          <option value="OCR_EXHAUSTED">OCR_EXHAUSTED</option>
        </select>
        <select name="human" defaultValue={filters.human} aria-label="Human review">
          <option value="">Human review</option>
          <option value="yes">Requested</option>
          <option value="no">Not requested</option>
        </select>
        <button className="rounded bg-zinc-900 px-3 py-1 text-white" type="submit">Filter</button>
      </form>
      <ReviewQueue
        jobId={jobId}
        jobTitle={queue.job.title}
        rows={queue.rows}
        detail={detail}
        page={queue.page}
        pageCount={queue.pageCount}
        query={search.toString()}
      />
      </>
      )}
      <CopilotPanel jobId={jobId} companyId={queue.job.companyId} />
    </main>
  );
}
