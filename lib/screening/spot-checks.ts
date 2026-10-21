import { randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { loadScreeningPool } from "@/lib/screening/screening-data";

/**
 * Each week a person re-reads five randomly chosen candidates the screening
 * placed below the cutoff, including anyone closed through a bulk close-out
 * in the last week. Disagreements are recorded and counted; the sample never
 * changes a candidate's status by itself.
 */

export const SPOT_CHECK_SIZE = 5;
export const SPOT_CHECK_SOURCES = ["POSSIBLE_FIT", "WEAK_EVIDENCE", "NOT_MET", "CLOSED_OUT"] as const;
export const SPOT_CHECK_OUTCOMES = ["PLACEMENT_OK", "SHOULD_RECONSIDER"] as const;
export type SpotCheckOutcome = (typeof SPOT_CHECK_OUTCOMES)[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week containing `now`. */
export function weekStartOf(now: Date) {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}

/** Uniform sample without replacement. */
export function sampleWithoutReplacement<T>(items: T[], size: number, pick: (max: number) => number = randomInt) {
  const copy = [...items];
  const out: T[] = [];
  while (out.length < size && copy.length > 0) {
    const index = pick(copy.length);
    out.push(copy.splice(index, 1)[0]!);
  }
  return out;
}

function idsOf(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
}

export async function ensureWeeklySpotCheck(input: {
  jobId: number;
  companyId: number;
  now?: Date;
  pick?: (max: number) => number;
}): Promise<{ weekStart: Date; created: number; existing: number; eligible: number }> {
  const now = input.now ?? new Date();
  const weekStart = weekStartOf(now);
  const existing = await prisma.spotCheck.count({ where: { jobId: input.jobId, companyId: input.companyId, weekStart } });
  if (existing > 0) return { weekStart, created: 0, existing, eligible: 0 };

  const pool = await loadScreeningPool(input.jobId, input.companyId, now);
  if (!pool) return { weekStart, created: 0, existing: 0, eligible: 0 };
  const batches = await prisma.closeOutBatch.findMany({
    where: { jobId: input.jobId, companyId: input.companyId, approvedAt: { gte: new Date(weekStart.getTime() - WEEK_MS) } },
    select: { result: true },
  });
  const closedOut = new Set(
    batches.flatMap((batch) => {
      const result = batch.result as { closedIds?: unknown } | null;
      return idsOf(result?.closedIds);
    }),
  );
  const eligible = pool.rows.flatMap((row) => {
    if (closedOut.has(row.applicationId)) return [{ applicationId: row.applicationId, source: "CLOSED_OUT" }];
    const category = row.evaluation.category;
    return (SPOT_CHECK_SOURCES as readonly string[]).includes(category) ? [{ applicationId: row.applicationId, source: category }] : [];
  });
  const sample = sampleWithoutReplacement(eligible, SPOT_CHECK_SIZE, input.pick);
  if (sample.length === 0) return { weekStart, created: 0, existing: 0, eligible: 0 };

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(918273, ${input.jobId}::int)`);
    const raced = await tx.spotCheck.count({ where: { jobId: input.jobId, companyId: input.companyId, weekStart } });
    if (raced > 0) return 0;
    const result = await tx.spotCheck.createMany({
      data: sample.map((row) => ({
        companyId: input.companyId,
        jobId: input.jobId,
        applicationId: row.applicationId,
        weekStart,
        sourceCategory: row.source,
      })),
      skipDuplicates: true,
    });
    return result.count;
  });
  return { weekStart, created, existing: 0, eligible: eligible.length };
}

/** Cron entry: one sample per job with a saved screening policy and open applicants. */
export async function runWeeklySpotChecks(now = new Date()) {
  const jobs = await prisma.jobScreeningPolicy.findMany({ distinct: ["jobId"], select: { jobId: true, companyId: true } });
  let created = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      created += (await ensureWeeklySpotCheck({ jobId: job.jobId, companyId: job.companyId, now })).created;
    } catch (error) {
      failed += 1;
      console.error("[spot-check] job failed", job.jobId, error instanceof Error ? error.message : "unknown");
    }
  }
  return { jobs: jobs.length, created, failed };
}

export async function listSpotChecks(jobId: number, companyId: number, weeks = 4) {
  const since = new Date(weekStartOf(new Date()).getTime() - (weeks - 1) * WEEK_MS);
  const rows = await prisma.spotCheck.findMany({
    where: { jobId, companyId, weekStart: { gte: since } },
    orderBy: [{ weekStart: "desc" }, { id: "asc" }],
    select: {
      id: true,
      weekStart: true,
      sourceCategory: true,
      reviewedAt: true,
      outcome: true,
      note: true,
      application: { select: { id: true, status: true, candidate: { select: { name: true } } } },
    },
  });
  const reviewed = rows.filter((row) => row.reviewedAt);
  return {
    rows,
    reviewed: reviewed.length,
    reconsider: reviewed.filter((row) => row.outcome === "SHOULD_RECONSIDER").length,
  };
}

export async function reviewSpotCheck(input: {
  spotCheckId: number;
  jobId: number;
  companyId: number;
  actorUserId: number;
  outcome: string;
  note: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(SPOT_CHECK_OUTCOMES as readonly string[]).includes(input.outcome)) return { ok: false, error: "Choose an outcome." };
  const note = input.note.trim().slice(0, 1000);
  if (input.outcome === "SHOULD_RECONSIDER" && note.length < 5) {
    return { ok: false, error: "Say what should be reconsidered." };
  }
  const changed = await prisma.spotCheck.updateMany({
    where: { id: input.spotCheckId, jobId: input.jobId, companyId: input.companyId, reviewedAt: null },
    data: { reviewedAt: new Date(), reviewedByUserId: input.actorUserId, outcome: input.outcome, note: note || null },
  });
  if (changed.count !== 1) return { ok: false, error: "This spot check was already reviewed." };
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "SPOT_CHECK_REVIEWED",
    targetType: "SPOT_CHECK",
    targetId: input.spotCheckId,
    // The note is stored on the spot check, where erasure can clear it. The append-only log keeps the outcome.
    reason: `${input.outcome}${note ? " | note recorded" : ""}`,
  });
  return { ok: true };
}
