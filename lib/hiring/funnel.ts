import { ApplicationPipelineStatus } from "@prisma/client";

import { resolveApplicationSourceLabel } from "@/lib/hiring/ingestion-source";

/**
 * HireIQ hiring funnel — operational counts, not a quality score.
 *
 * Applied → assessment complete → shortlisted → interview booked →
 * offer sent → accepted → hired → billed.
 *
 * Assessment score, match, and ranking are never combined here.
 */

export const HIRING_FUNNEL_STAGES = [
  { key: "applied", label: "Applied" },
  { key: "assessed", label: "Assessment complete" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "interviewed", label: "Interview booked" },
  { key: "offered", label: "Offer sent" },
  { key: "accepted", label: "Offer accepted" },
  { key: "hired", label: "Hired" },
  { key: "billed", label: "Billed" },
] as const;

export type HiringFunnelStageKey = (typeof HIRING_FUNNEL_STAGES)[number]["key"];

export type HiringFunnelStage = {
  key: HiringFunnelStageKey;
  label: string;
  count: number;
};

export type ApplicationFunnelSnapshot = {
  createdAt: Date;
  status: ApplicationPipelineStatus;
  shortlistedAt: Date | null;
  assessmentSubmittedAt: Date | null;
  interviewBookedAt: Date | null;
  offerMintedAt: Date | null;
  offerAcceptedAt: Date | null;
  billedAt: Date | null;
  sourceChannel?: string | null;
  sourcingDatabaseSource?: string | null;
  hostedApplySubmissionId?: number | null;
};

export type HiringFunnelReport = {
  funnel: HiringFunnelStage[];
  sources: Array<{ source: string; count: number; hires: number }>;
  timeToShortlistDays: number | null;
  timeToHireDays: number | null;
  totals: {
    applications: number;
    active: number;
    hired: number;
    rejected: number;
  };
};

const SHORTLISTED_OR_LATER: ApplicationPipelineStatus[] = [
  ApplicationPipelineStatus.SHORTLISTED,
  ApplicationPipelineStatus.SELECTED,
  ApplicationPipelineStatus.HIRED,
];

function meanDays(spans: number[]): number | null {
  if (spans.length === 0) return null;
  return Math.round((spans.reduce((sum, d) => sum + d, 0) / spans.length) * 10) / 10;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

export function reachedHiringStage(
  snapshot: ApplicationFunnelSnapshot,
  key: HiringFunnelStageKey,
): boolean {
  switch (key) {
    case "applied":
      return true;
    case "assessed":
      return snapshot.assessmentSubmittedAt != null;
    case "shortlisted":
      return (
        snapshot.shortlistedAt != null ||
        SHORTLISTED_OR_LATER.includes(snapshot.status)
      );
    case "interviewed":
      return snapshot.interviewBookedAt != null;
    case "offered":
      return snapshot.offerMintedAt != null || snapshot.offerAcceptedAt != null;
    case "accepted":
      return snapshot.offerAcceptedAt != null;
    case "hired":
      return snapshot.status === ApplicationPipelineStatus.HIRED;
    case "billed":
      return snapshot.billedAt != null;
  }
}

export function buildHiringFunnelReport(
  snapshots: ApplicationFunnelSnapshot[],
): HiringFunnelReport {
  const hired = snapshots.filter((s) => s.status === ApplicationPipelineStatus.HIRED);
  const rejected = snapshots.filter(
    (s) => s.status === ApplicationPipelineStatus.REJECTED,
  );

  const funnel: HiringFunnelStage[] = HIRING_FUNNEL_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: snapshots.filter((snapshot) => reachedHiringStage(snapshot, stage.key))
      .length,
  }));

  const sourceMap = new Map<string, { count: number; hires: number }>();
  for (const snapshot of snapshots) {
    const source = resolveApplicationSourceLabel(snapshot);
    const entry = sourceMap.get(source) ?? { count: 0, hires: 0 };
    entry.count += 1;
    if (snapshot.status === ApplicationPipelineStatus.HIRED) entry.hires += 1;
    sourceMap.set(source, entry);
  }

  const timeToShortlistDays = meanDays(
    snapshots
      .filter((s) => s.shortlistedAt)
      .map((s) => daysBetween(s.createdAt, s.shortlistedAt as Date)),
  );

  // Prefer offerAcceptedAt. Do not use updatedAt — that is not a hire timestamp.
  const timeToHireDays = meanDays(
    hired
      .filter((s) => s.offerAcceptedAt)
      .map((s) => daysBetween(s.createdAt, s.offerAcceptedAt as Date)),
  );

  return {
    funnel,
    sources: [...sourceMap.entries()]
      .map(([source, value]) => ({ source, ...value }))
      .sort((a, b) => b.count - a.count),
    timeToShortlistDays,
    timeToHireDays,
    totals: {
      applications: snapshots.length,
      active: snapshots.length - hired.length - rejected.length,
      hired: hired.length,
      rejected: rejected.length,
    },
  };
}
