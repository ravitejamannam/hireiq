/**
 * How usable an extraction is. A low score keeps the text when it is the
 * best attempt, and marks the file for review.
 */

const RESUME_SIGNALS = ["experience", "education", "skills", "employment", "summary"];

export type ExtractionQuality = {
  wordCount: number;
  garbledRatio: number;
  hasResumeSignals: boolean;
  score: number;
  needsReview: boolean;
};

export function scoreExtraction(text: string): ExtractionQuality {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized.length === 0 ? [] : normalized.split(" ").filter(Boolean);
  const wordCount = words.length;
  const letters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  const garbled = normalized.match(/[^\p{L}\p{N}\s.,;:'’"()\/&+@#%-]/gu)?.length ?? 0;
  const garbledRatio = garbled / Math.max(normalized.length, 1);
  const lower = normalized.toLowerCase();
  const hasResumeSignals = RESUME_SIGNALS.some((word) => lower.includes(word));

  const wordScore = Math.min(wordCount / 80, 1);
  const clarity = 1 - Math.min(garbledRatio * 4, 1);
  const letterShare = letters / Math.max(normalized.length, 1);
  const score = Number(
    (wordScore * 0.5 + clarity * 0.3 + letterShare * 0.1 + (hasResumeSignals ? 0.1 : 0)).toFixed(3),
  );
  const needsReview = wordCount < 40 || garbledRatio > 0.08 || score < 0.45;

  return { wordCount, garbledRatio: Number(garbledRatio.toFixed(3)), hasResumeSignals, score, needsReview };
}

export function columnJumbleShare(text: string): number | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 12) return null;
  const short = lines.filter((line) => line.length < 28).length;
  return short / lines.length;
}

/**
 * Two-column and text-box resumes often come back as many short lines.
 * Skill lists and bullets can look the same, so callers log every trigger.
 */
export function textLooksColumnJumbled(text: string): boolean {
  const share = columnJumbleShare(text);
  return share !== null && share >= 0.45;
}

/** Prefer the attempt with more real words, then the higher score. */
export function betterExtraction(
  current: { text: string; quality: ExtractionQuality } | null,
  next: { text: string; quality: ExtractionQuality },
): { text: string; quality: ExtractionQuality } {
  if (!current) return next;
  if (next.quality.score !== current.quality.score) {
    return next.quality.score > current.quality.score ? next : current;
  }
  return next.quality.wordCount > current.quality.wordCount ? next : current;
}

const ADDRESS_HINT =
  /\b(street|st\.|road|rd\.|nagar|marg|lane|avenue|ave\.|apartment|apt\.|plot|sector|colony|layout)\b/i;

/**
 * Strip contact and identity markers before a resume is saved as a fixture.
 * Only the parsed name and the first line are treated as a person's name,
 * so phrases like "Machine Learning" stay in the file.
 */
export function redactResumeFixture(text: string, parsedName?: string | null): string {
  const withoutIds = text
    .replace(/https?:\/\/(?:[\w-]+\.)?linkedin\.com\/\S+/gi, "[linkedin]")
    .replace(/\blinkedin\.com\/in\/\S+/gi, "[linkedin]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[pan]")
    .replace(/\b[2-9]\d{3}\s\d{4}\s\d{4}\b/g, "[aadhaar]")
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "[phone]");

  const named = parsedName?.trim()
    ? withoutIds.split(parsedName.trim()).join("[name]")
    : withoutIds;

  let replacedTop = false;
  const lines = named.split("\n").map((line) => {
    if (!replacedTop && line.trim()) {
      replacedTop = true;
      return "[name]";
    }
    if (ADDRESS_HINT.test(line) || /\b[1-9]\d{5}\b/.test(line)) return "[address]";
    return line;
  });
  return lines.join("\n");
}
