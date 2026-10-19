export type ExtractionUsage = {
  feature: "resume_fields" | "resume_vision";
  model: string;
  promptTokens: number;
  completionTokens: number;
};

type Listener = (usage: ExtractionUsage) => void;

let listener: Listener | null = null;

/** Scoring and audits can observe token use. Production callers leave this unset. */
export function listenForExtractionUsage(next: Listener | null): () => void {
  const previous = listener;
  listener = next;
  return () => {
    listener = previous;
  };
}

export function recordExtractionUsage(usage: ExtractionUsage) {
  listener?.(usage);
}
