import { ApplicationPipelineStatus, RequirementLifecycle } from "@prisma/client";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  buildHiringFunnelReport,
  type HiringFunnelReport,
} from "@/lib/hiring/funnel";
import { getAnalyticsFunnelSnapshots } from "@/lib/hiring/requirement-desk";
import { prisma } from "@/lib/prisma";

/**
 * Hiring analytics (admin-only, read-only).
 *
 * Hiring funnel uses ingestion channel + real timestamps.
 * Pipeline funnel remains the operational stage counts.
 * Analytics never mutates source data and never invents a combined score.
 */

export type FunnelStage = {
  status: string;
  label: string;
  count: number;
};

export type AnalyticsReport = HiringFunnelReport & {
  pipelineFunnel: FunnelStage[];
  perRequirement: Array<{
    jobId: number;
    title: string;
    total: number;
    hired: number;
    active: number;
  }>;
};

const STAGE_ORDER: Array<{ status: ApplicationPipelineStatus; label: string }> = [
  { status: "CV_POOL", label: "CV Pool" },
  { status: "EXPERT_REVIEW", label: "Expert Review" },
  { status: "TECH_EVALUATION", label: "Tech Evaluation" },
  { status: "SHORTLISTED", label: "Shortlisted" },
  { status: "SELECTED", label: "Selected" },
  { status: "HIRED", label: "Hired" },
];

export async function getAnalyticsReport(): Promise<AnalyticsReport> {
  const admin = await requireAdmin();
  const companyWhere = admin.companyId ? { companyId: admin.companyId } : {};

  const [snapshots, applications] = await Promise.all([
    getAnalyticsFunnelSnapshots(admin.companyId),
    prisma.application.findMany({
      where: companyWhere,
      select: {
        id: true,
        status: true,
        job: { select: { id: true, title: true } },
      },
    }),
  ]);

  const hiring = buildHiringFunnelReport(snapshots);

  const hiredApps = applications.filter((a) => a.status === "HIRED");

  const pipelineFunnel: FunnelStage[] = STAGE_ORDER.map(({ status, label }) => {
    const reached =
      status === "HIRED"
        ? hiredApps.length
        : applications.filter(
            (a) =>
              stageRank(a.status as ApplicationPipelineStatus) >=
              stageRank(status),
          ).length;
    return { status, label, count: reached };
  });

  const perJob = new Map<
    number,
    { title: string; total: number; hired: number; active: number }
  >();
  for (const app of applications) {
    const entry =
      perJob.get(app.job.id) ??
      perJob
        .set(app.job.id, {
          title: app.job.title,
          total: 0,
          hired: 0,
          active: 0,
        })
        .get(app.job.id)!;
    entry.total += 1;
    if (app.status === "HIRED") entry.hired += 1;
    else if (app.status !== "REJECTED") entry.active += 1;
  }

  return {
    ...hiring,
    pipelineFunnel,
    perRequirement: [...perJob.entries()]
      .map(([jobId, v]) => ({ jobId, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}

function stageRank(status: ApplicationPipelineStatus): number {
  const order: ApplicationPipelineStatus[] = [
    "CV_POOL",
    "EXPERT_REVIEW",
    "TECH_EVALUATION",
    "SHORTLISTED",
    "SELECTED",
    "HIRED",
  ];
  const idx = order.indexOf(status);
  return idx === -1 ? -1 : idx;
}

void RequirementLifecycle.REQUIREMENT_POSTED;
