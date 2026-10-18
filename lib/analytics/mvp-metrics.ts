export type StageEvent = { applicationId: number; status: string; at: string; source: string | null };
export type ScorecardTiming = { submittedAt: string | null; dueAt: string };
export type AiAction = { reviewerAction: "ACCEPTED" | "EDITED" | "DISMISSED" | "OVERRIDDEN" | "PENDING" };

export function funnelCounts(events: StageEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

export function timeInStageHours(events: Array<{ applicationId: number; status: string; at: string }>) {
  const grouped = new Map<number, Array<{ status: string; at: string }>>();
  for (const event of events) {
    const list = grouped.get(event.applicationId) ?? [];
    list.push(event);
    grouped.set(event.applicationId, list);
  }
  const durations: Array<{ applicationId: number; status: string; hours: number }> = [];
  for (const [applicationId, list] of grouped) {
    const ordered = [...list].sort((a, b) => a.at.localeCompare(b.at));
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const start = Date.parse(ordered[index].at);
      const end = Date.parse(ordered[index + 1].at);
      durations.push({
        applicationId,
        status: ordered[index].status,
        hours: (end - start) / 3_600_000,
      });
    }
  }
  return durations;
}

export function sourceCounts(events: StageEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const source = event.source ?? "unknown";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()].map(([source, count]) => ({ source, count }));
}

export function feedbackTimeliness(rows: ScorecardTiming[]) {
  const decided = rows.filter((row) => row.submittedAt);
  const onTime = decided.filter((row) => Date.parse(row.submittedAt!) <= Date.parse(row.dueAt));
  return { submitted: decided.length, onTime: onTime.length, overdue: rows.length - decided.length };
}

export function aiActionRates(rows: AiAction[]) {
  const total = rows.length || 1;
  const count = (action: AiAction["reviewerAction"]) => rows.filter((row) => row.reviewerAction === action).length;
  return {
    accept: count("ACCEPTED") / total,
    edit: count("EDITED") / total,
    dismiss: count("DISMISSED") / total,
    override: count("OVERRIDDEN") / total,
  };
}
