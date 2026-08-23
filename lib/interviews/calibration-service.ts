import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * Interviewer calibration stats (T99 Phase 8).
 *
 * Karat keeps calibration opaque; HireIQ makes it transparent and
 * self-diagnosing. Every rubric score is a snapshot (name + weight +
 * 1-5 score). We normalize each score to a 0-100 percentage, then compare
 * each interviewer's mean against the platform mean on shared competencies.
 *
 * This is decision-support for ADMINS ONLY — it never feeds candidate
 * ranking or hiring decisions (§21/§22: machine output stays separate
 * from human decisions; §33: no hidden composite scores).
 *
 * Labels are descriptive, never punitive: "tends stricter / lenient".
 */

const MAX_ROWS = 1000;
const MIN_SCORES_FOR_LABEL = 5;
const LABEL_DELTA_THRESHOLD = 10;

export type InterviewerCalibration = {
  interviewerId: number;
  interviewerName: string;
  evaluationsRubricScored: number;
  scoresCount: number;
  avgPercentage: number;
  deltaVsPlatform: number;
  tendency: "CALIBRATED" | "TENDS_STRICTER" | "TENDS_LENIENT" | "INSUFFICIENT_DATA";
};

export type CompetencyCalibration = {
  competencyName: string;
  samples: number;
  platformAvgPercentage: number;
};

export type CalibrationReport = {
  generatedAt: Date;
  platformAvgPercentage: number;
  totalRubricEvaluations: number;
  interviewers: InterviewerCalibration[];
  competencies: CompetencyCalibration[];
};

type ScoreRow = {
  score: number;
  weightSnapshot: number;
  competencyName: string;
  evaluationId: number;
  interviewerId: number;
  interviewerName: string;
};

/** Pure computation — exported for unit testing without a database. */
export function computeCalibration(rows: ScoreRow[]): Omit<CalibrationReport, "generatedAt"> {
  const valid = rows.filter(
    (r) => Number.isInteger(r.score) && r.score >= 1 && r.score <= 5,
  );

  const percentages = valid.map((r) => ({
    ...r,
    pct: (r.score / 5) * 100,
  }));

  const platformAvg =
    percentages.length > 0
      ? percentages.reduce((sum, r) => sum + r.pct, 0) / percentages.length
      : 0;

  // Group by interviewer
  const byInterviewer = new Map<
    number,
    { name: string; evals: Set<number>; pcts: number[] }
  >();
  for (const r of percentages) {
    let entry = byInterviewer.get(r.interviewerId);
    if (!entry) {
      entry = { name: r.interviewerName, evals: new Set(), pcts: [] };
      byInterviewer.set(r.interviewerId, entry);
    }
    entry.evals.add(r.evaluationId);
    entry.pcts.push(r.pct);
  }

  const interviewers: InterviewerCalibration[] = [...byInterviewer.entries()]
    .map(([interviewerId, entry]) => {
      const avg = entry.pcts.reduce((s, p) => s + p, 0) / entry.pcts.length;
      const delta = avg - platformAvg;
      const tendency: InterviewerCalibration["tendency"] =
        entry.pcts.length < MIN_SCORES_FOR_LABEL
          ? "INSUFFICIENT_DATA"
          : delta <= -LABEL_DELTA_THRESHOLD
            ? "TENDS_STRICTER"
            : delta >= LABEL_DELTA_THRESHOLD
              ? "TENDS_LENIENT"
              : "CALIBRATED";

      return {
        interviewerId,
        interviewerName: entry.name,
        evaluationsRubricScored: entry.evals.size,
        scoresCount: entry.pcts.length,
        avgPercentage: Math.round(avg * 10) / 10,
        deltaVsPlatform: Math.round(delta * 10) / 10,
        tendency,
      };
    })
    .sort((a, b) => b.scoresCount - a.scoresCount);

  // Per-competency platform averages (context for interpreting deltas)
  const byCompetency = new Map<string, number[]>();
  for (const r of percentages) {
    const list = byCompetency.get(r.competencyName) ?? [];
    list.push(r.pct);
    byCompetency.set(r.competencyName, list);
  }

  const competencies: CompetencyCalibration[] = [...byCompetency.entries()]
    .map(([competencyName, pcts]) => ({
      competencyName,
      samples: pcts.length,
      platformAvgPercentage:
        Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10,
    }))
    .sort((a, b) => b.samples - a.samples);

  const distinctEvals = new Set(percentages.map((r) => r.evaluationId)).size;

  return {
    platformAvgPercentage: Math.round(platformAvg * 10) / 10,
    totalRubricEvaluations: distinctEvals,
    interviewers,
    competencies,
  };
}

export async function getCalibrationReport(): Promise<CalibrationReport> {
  await requireAdmin();

  const rows = await prisma.evaluationCompetencyScore.findMany({
    select: {
      score: true,
      weightSnapshot: true,
      competencyName: true,
      evaluationId: true,
      evaluation: {
        select: {
          interviewer: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { id: "desc" },
    take: MAX_ROWS,
  });

  const mapped: ScoreRow[] = rows.map((row) => ({
    score: row.score,
    weightSnapshot: row.weightSnapshot,
    competencyName: row.competencyName,
    evaluationId: row.evaluationId,
    interviewerId: row.evaluation.interviewer.id,
    interviewerName: row.evaluation.interviewer.name,
  }));

  return {
    generatedAt: new Date(),
    ...computeCalibration(mapped),
  };
}
