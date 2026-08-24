import { ApplicationPipelineStatus, RequirementLifecycle } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * Hiring analytics (admin-only, read-only).
 *
 * Funnel counts, stage conversion, source performance and time-to-hire —
 * computed from live application rows. Read-only by design: analytics
 * must never mutate source data.
 */

export type FunnelStage = {
  status: string;
  label: string;
  count: number;
};

export type AnalyticsReport = {
  totals: {
    applications: number;
    active: number;
    hired: number;
    rejected: number;
  };
  funnel: FunnelStage[];
  sources: Array<{ source: string; count: number; hires: number }>;
  timeToHireDays: number | null;
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
  await requireAdmin();

  const applications = await prisma.application.findMany({
    select: {
      id: true,
      status: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      job: { select: { id: true, title: true } },
    },
  });

  const total = applications.length;
  const hiredApps = applications.filter((a) => a.status === "HIRED");
  const rejected = applications.filter((a) => a.status === "REJECTED");
  const active = total - hiredApps.length - rejected.length;

  const funnel: FunnelStage[] = STAGE_ORDER.map(({ status, label }) => {
    const reached =
      status === "HIRED"
        ? hiredApps.length
        : applications.filter((a) =>
            stageRank(a.status as ApplicationPipelineStatus) >=
            stageRank(status),
          ).length;
    return { status, label, count: reached };
  });

  const sourceMap = new Map<string, { count: number; hires: number }>();
  for (const app of applications) {
    const key = app.source ?? "Unknown";
    const entry = sourceMap.get(key) ?? { count: 0, hires: 0 };
    entry.count += 1;
    if (app.status === "HIRED") entry.hires += 1;
    sourceMap.set(key, entry);
  }

  let timeToHireDays: number | null = null;
  if (hiredApps.length > 0) {
    const days = hiredApps.map(
      (a) =>
        (a.updatedAt.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    timeToHireDays =
      Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10;
  }

  const perJob = new Map<number, { title: string; total: number; hired: number; active: number }>();
  for (const app of applications) {
    const entry =
      perJob.get(app.job.id) ??
      perJob.set(app.job.id, {
        title: app.job.title,
        total: 0,
        hired: 0,
        active: 0,
      }).get(app.job.id)!;
    entry.total += 1;
    if (app.status === "HIRED") entry.hired += 1;
    else if (app.status !== "REJECTED") entry.active += 1;
  }

  return {
    totals: { applications: total, active, hired: hiredApps.length, rejected: rejected.length },
    funnel,
    sources: [...sourceMap.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.count - a.count),
    timeToHireDays,
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

// keep lifecycle import referenced for future requirement-level analytics
void RequirementLifecycle.REQUIREMENT_POSTED;
