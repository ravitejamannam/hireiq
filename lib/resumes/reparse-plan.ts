import { scoreExtraction } from "@/lib/resumes/extraction-quality";

export function reparseSelectionWhere(currentVersion: string) {
  return {
    OR: [
      { extractorVersion: null },
      { extractorVersion: { not: currentVersion } },
    ],
  } as const;
}

export function documentStillEligible(
  extractorVersion: string | null,
  currentVersion: string,
) {
  return extractorVersion === null || extractorVersion !== currentVersion;
}

type Extraction =
  | { ok: true; text: string; quality: { score: number; needsReview: boolean } }
  | { ok: false; errorCode: string };

export type ReparsePlan =
  | { action: "fail"; errorCode: string }
  | { action: "keep"; previousScore: number; nextScore: number }
  | {
      action: "update";
      previousScore: number | null;
      nextScore: number;
      data: {
        parseStatus: "PARSED";
        extractedText: string;
        parseErrorCode: "LOW_QUALITY" | null;
        extractorVersion: string;
      };
    };

/**
 * Compare-and-swap predicate. An update applies only when the text and
 * extractor version are still the values read before extraction.
 */
export function reparseUpdateWhere<Id>(input: {
  id: Id;
  extractedText: string | null;
  extractorVersion: string | null;
}) {
  return {
    id: input.id,
    extractedText: input.extractedText,
    extractorVersion: input.extractorVersion,
  };
}

/** A failed extract never writes. Equal or weaker scores keep the saved text. */
export function planReparse(input: {
  extractedText: string | null;
  extraction: Extraction;
  currentVersion: string;
}): ReparsePlan {
  if (!input.extraction.ok) {
    return { action: "fail", errorCode: input.extraction.errorCode };
  }
  const previousScore = input.extractedText
    ? scoreExtraction(input.extractedText).score
    : null;
  if (previousScore !== null && input.extraction.quality.score <= previousScore) {
    return {
      action: "keep",
      previousScore,
      nextScore: input.extraction.quality.score,
    };
  }
  return {
    action: "update",
    previousScore,
    nextScore: input.extraction.quality.score,
    data: {
      parseStatus: "PARSED",
      extractedText: input.extraction.text,
      parseErrorCode: input.extraction.quality.needsReview ? "LOW_QUALITY" : null,
      extractorVersion: input.currentVersion,
    },
  };
}
