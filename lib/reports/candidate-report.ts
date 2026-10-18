import { createHash } from "node:crypto";

export type ReportInput = {
  requirements: Array<{ id: number; text: string; status: "MEETS" | "NOT_MET" | "UNKNOWN"; quote: string | null }>;
  assessments: Array<{ id: number; title: string; score: number; maxScore: number }>;
  scorecards: Array<{ interviewerId: number; requirementId: number; rating: number }>;
  timeline: Array<{ at: string; event: string }>;
};

export function buildCandidateReport(input: ReportInput) {
  const sections = {
    requirements: input.requirements,
    assessments: input.assessments,
    scorecards: input.scorecards,
    timeline: input.timeline,
  };
  const narrative = input.requirements
    .map((row) => {
      const cite = row.quote ? `requirement ${row.id} quote` : `requirement ${row.id}`;
      return `${row.text} is ${row.status} (${cite}).`;
    })
    .join(" ");
  const inputHash = createHash("sha256").update(JSON.stringify(sections)).digest("hex");
  return { sections, narrative, inputHash, version: 1 };
}

export function nextReportVersion(previousHash: string | null, nextHash: string, previousVersion: number) {
  if (previousHash === nextHash) return previousVersion;
  return previousVersion + 1;
}
