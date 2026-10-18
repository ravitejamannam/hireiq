export type RenderableRequirement = {
  id: number;
  requirementType: "REQUIRED" | "PREFERRED";
  sourceText: string;
  approvalStatus: "DRAFT" | "APPROVED" | "REJECTED";
};

export type NarrativeSections = {
  summary: string;
  outcomes: string;
  responsibilities: string;
  process: string;
  benefits: string;
};

const REQUIREMENT_LINE = /\[req:(\d+)\]\s+(.+)/;

export function renderJobDescription(input: {
  narrative: NarrativeSections;
  requirements: RenderableRequirement[];
}) {
  const approved = input.requirements.filter((row) => row.approvalStatus === "APPROVED");
  const required = approved
    .filter((row) => row.requirementType === "REQUIRED")
    .map((row) => `- [req:${row.id}] ${row.sourceText}`);
  const preferred = approved
    .filter((row) => row.requirementType === "PREFERRED")
    .map((row) => `- [req:${row.id}] ${row.sourceText}`);
  return [
    input.narrative.summary,
    "",
    "Outcomes",
    input.narrative.outcomes,
    "",
    "Responsibilities",
    input.narrative.responsibilities,
    "",
    "Requirements",
    ...required,
    "",
    "Nice to have",
    ...preferred,
    "",
    "Process",
    input.narrative.process,
    "",
    "Benefits",
    input.narrative.benefits,
  ].join("\n");
}

export function diffRequirementLines(draft: string, requirements: RenderableRequirement[]) {
  const approvedIds = new Set(
    requirements.filter((row) => row.approvalStatus === "APPROVED").map((row) => row.id),
  );
  const missing: string[] = [];
  for (const line of draft.split("\n")) {
    const match = line.match(REQUIREMENT_LINE);
    if (!match) continue;
    const id = Number(match[1]);
    if (!approvedIds.has(id)) missing.push(line);
  }
  const renderedIds = new Set(
    [...draft.matchAll(/\[req:(\d+)\]/g)].map((match) => Number(match[1])),
  );
  for (const id of approvedIds) {
    if (!renderedIds.has(id)) missing.push(`missing requirement ${id}`);
  }
  return missing;
}
