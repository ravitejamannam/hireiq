import { CandidateClaimPolarity, CandidateClaimType } from "@prisma/client";

import type { ExtractedClaimDraft } from "@/lib/candidates/intelligence/intelligence-types";
import {
  catalogAliasesLongestFirst,
  resolveSkillAlias,
} from "@/lib/ontology/skill-alias";

const NEGATION_PREFIX =
  /(?:\bbut\s+not|\bno\s+experience(?:\s+with|\s+in)?|\bnever(?:\s+used)?|\bwithout|\bnot|\bno)\s*$/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function polarityBefore(text: string, start: number): CandidateClaimPolarity {
  const prefix = text.slice(Math.max(0, start - 48), start);
  if (NEGATION_PREFIX.test(prefix.trimEnd())) {
    return CandidateClaimPolarity.NEGATED;
  }
  return CandidateClaimPolarity.POSITIVE;
}

function overlaps(
  start: number,
  end: number,
  taken: Array<{ start: number; end: number }>,
) {
  return taken.some((span) => start < span.end && end > span.start);
}

export const DETERMINISTIC_EXTRACTOR_VERSION = "v1.1";
export const DETERMINISTIC_MODEL_PROVIDER = "none";
export const DETERMINISTIC_MODEL_NAME = "deterministic";
export const DETERMINISTIC_PROMPT_VERSION = "none";

export function extractClaimsDeterministically(
  evidenceText: string,
): ExtractedClaimDraft[] {
  const text = evidenceText ?? "";
  if (!text.trim()) {
    return [];
  }

  const drafts: ExtractedClaimDraft[] = [];
  const taken: Array<{ start: number; end: number }> = [];
  const seen = new Set<string>();

  for (const alias of catalogAliasesLongestFirst()) {
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(alias)}(?![A-Za-z0-9])`, "gi");
    let match = pattern.exec(text);
    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (!overlaps(start, end, taken)) {
        const resolved = resolveSkillAlias(match[0]);
        if (resolved) {
          const polarity = polarityBefore(text, start);
          const key = `${resolved.canonicalKey}:${polarity}`;
          if (!seen.has(key)) {
            seen.add(key);
            drafts.push({
              claimType: CandidateClaimType.SKILL,
              value: match[0],
              normalizedValue: resolved.canonicalKey,
              sourceSpanStart: start,
              sourceSpanEnd: end,
              polarity,
            });
          }
          taken.push({ start, end });
        }
      }
      match = pattern.exec(text);
    }
  }

  return drafts;
}
