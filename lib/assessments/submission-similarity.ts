function shingles(source: string) {
  const tokens = source
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
  const grams = new Set<string>();
  for (let index = 0; index < tokens.length - 2; index += 1) {
    grams.add(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  }
  if (grams.size === 0 && tokens.length > 0) grams.add(tokens.join(" "));
  return grams;
}

/** Jaccard similarity of word trigrams. 1 means the same submission. */
export function submissionSimilarity(left: string, right: string) {
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export type Difficulty = "easy" | "medium" | "hard";

export function difficultyForSortOrder(sortOrder: number): Difficulty {
  if (sortOrder <= 2) return "easy";
  if (sortOrder <= 5) return "medium";
  return "hard";
}

export type ProctorEvent = "tab_hidden" | "paste" | "window_blur" | "copy";

/** Signals for a reviewer. They never change the score. */
export function proctorNote(event: ProctorEvent) {
  return {
    event,
    informational: true as const,
    scoreDelta: 0,
    label:
      event === "paste"
        ? "Pasted text during the assessment"
        : event === "tab_hidden" || event === "window_blur"
          ? "Left the assessment tab"
          : "Copied text during the assessment",
  };
}
