import { describe, expect, it } from "vitest";

import {
  LAYER_M8_LEXICAL,
  LAYER_M9_SEMANTIC,
  LAYER_MATCHER_V1,
  LAYER_MATCHER_V2,
  LAYER_T94_RANKING,
  lexicalRetrievalLabel,
  matcherV1CoverageLabel,
  matcherV2Label,
  semanticRetrievalLabel,
  t94RankingLabel,
} from "@/lib/candidates/decision-support-layers";

describe("decision-support layer terminology", () => {
  it("keeps Matcher V2, T94, M8, and M9 as distinct labeled layers", () => {
    expect(new Set([
      LAYER_MATCHER_V1,
      LAYER_MATCHER_V2,
      LAYER_T94_RANKING,
      LAYER_M8_LEXICAL,
      LAYER_M9_SEMANTIC,
    ]).size).toBe(5);

    expect(matcherV1CoverageLabel("Backend")).toContain("Matcher V1");
    expect(matcherV2Label("Backend")).toContain("Matcher V2");
    expect(t94RankingLabel("Backend")).toContain("T94");
    expect(lexicalRetrievalLabel("Backend")).toContain("M8 lexical");
    expect(semanticRetrievalLabel("Backend")).toContain("M9 semantic");

    const labels = [
      matcherV1CoverageLabel("Backend"),
      matcherV2Label("Backend"),
      t94RankingLabel("Backend"),
      lexicalRetrievalLabel("Backend"),
      semanticRetrievalLabel("Backend"),
    ].join(" | ");
    expect(labels.includes("candidateScore")).toBe(false);
    expect(labels.includes("hybrid")).toBe(false);
  });
});
