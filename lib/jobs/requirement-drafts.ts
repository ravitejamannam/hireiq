export type ExtractedLine = {
  text: string;
  source: string;
};

export type DraftRequirement = {
  sourceText: string;
  citation: string;
  approvalStatus: "DRAFT";
  origin: "AI";
  requirementType: "REQUIRED" | "PREFERRED";
};

/** Drafts are saved only when the citation is a sentence that exists in the source. */
export function draftRequirementsFromExtraction(lines: ExtractedLine[]): DraftRequirement[] {
  return lines.flatMap((line) => {
    const citation = line.text.trim();
    if (!citation || !line.source.includes(citation)) return [];
    const preferred = /\b(nice to have|preferred|bonus)\b/i.test(citation);
    return [{
      sourceText: citation,
      citation,
      approvalStatus: "DRAFT" as const,
      origin: "AI" as const,
      requirementType: preferred ? "PREFERRED" as const : "REQUIRED" as const,
    }];
  });
}
