import { protectedQuestion, refusalForProtectedQuestion } from "@/lib/copilot/policy";

export const MCP_TOOLS = ["search_candidates", "pipeline_stats", "job_details"] as const;

const FORBIDDEN = ["reject_candidate", "emotion", "personality", "scrape_profiles", "autonomous_interview"];

export function mcpTools() {
  return MCP_TOOLS.filter((name) => !FORBIDDEN.includes(name)).map((name) => ({ name, readOnly: true }));
}

export function callMcpTool(input: {
  tool: string;
  question: string;
  actorCompanyId: number;
  jobCompanyId: number;
  job: { id: number; title: string; counts: Record<string, number> } | null;
  candidates: Array<{ name: string; quote: string }>;
}) {
  if (!MCP_TOOLS.includes(input.tool as (typeof MCP_TOOLS)[number])) {
    return { ok: false as const, error: "That tool is not available." };
  }
  if (protectedQuestion(input.question)) return { ok: false as const, error: refusalForProtectedQuestion() };
  if (!input.job || input.actorCompanyId !== input.jobCompanyId) return { ok: false as const, error: "Job not found." };
  if (input.tool === "job_details") return { ok: true as const, data: { id: input.job.id, title: input.job.title } };
  if (input.tool === "pipeline_stats") return { ok: true as const, data: input.job.counts };
  return { ok: true as const, data: input.candidates.map((row) => ({ name: row.name, quote: row.quote })) };
}
