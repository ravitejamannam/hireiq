import { protectedQuestion, refusalForProtectedQuestion } from "@/lib/copilot/policy";

export type ReportFilter = {
  metric: "time_to_hire" | "drop_off" | "source_quality";
  source: string | null;
  stage: string | null;
};

export function parseReportFilter(question: string): { filter: ReportFilter; refusal: null } | { filter: null; refusal: string } {
  if (protectedQuestion(question)) return { filter: null, refusal: refusalForProtectedQuestion() };
  const text = question.toLowerCase();
  const metric = text.includes("drop") ? "drop_off" : text.includes("source") ? "source_quality" : "time_to_hire";
  const source = /naukri|linkedin|indeed/.exec(text)?.[0]?.toUpperCase() ?? null;
  const stage = /cv_pool|expert_review|shortlisted|hired|rejected/.exec(text)?.[0]?.toUpperCase() ?? null;
  return { filter: { metric, source, stage }, refusal: null };
}

export function applyReportFilter<T extends { source: string | null; status: string }>(rows: T[], filter: ReportFilter) {
  return rows.filter((row) => {
    if (filter.source && row.source !== filter.source) return false;
    if (filter.stage && row.status !== filter.stage) return false;
    return true;
  });
}
