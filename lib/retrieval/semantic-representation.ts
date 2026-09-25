import { createHash } from "node:crypto";

import type { LexicalQuery } from "@/lib/retrieval/lexical-retrieval-types";

export function redactRetrievalText(text: string) {
  return text
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "[REDACTED_EMAIL]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[REDACTED_PHONE]")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSemanticJobQueryText(query: LexicalQuery) {
  return query.terms
    .map((term) => `${term.kind}:${term.sourceText}`)
    .join("\n");
}

export function hashEmbeddingContent(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
