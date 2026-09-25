import { describe, expect, it } from "vitest";

import {
  RETRIEVAL_BENCHMARK_CASES,
  RETRIEVAL_BENCHMARK_DATASET_LABEL,
} from "@/lib/evaluation/retrieval-benchmark-dataset";
import { compareLexicalAndSemanticBaselines } from "@/lib/retrieval/semantic-comparison";
import { validateSemanticRetrievalLimit } from "@/lib/validation/semantic-retrieval-validation";

describe("M8 vs M9 comparison", () => {
  it("uses the frozen synthetic dataset and does not declare a winner", async () => {
    expect(RETRIEVAL_BENCHMARK_DATASET_LABEL).toBe(
      "SYNTHETIC_NOT_RECRUITER_OUTCOMES",
    );
    expect(RETRIEVAL_BENCHMARK_CASES.map((row) => row.id)).toEqual([
      "exact-python",
      "alias-javascript",
      "false-friend-react-native",
      "negation-django",
      "missing-evidence",
    ]);

    const report = await compareLexicalAndSemanticBaselines();
    expect(report.datasetLabel).toBe("SYNTHETIC_NOT_RECRUITER_OUTCOMES");
    expect(report.m8.retrievalVersion).toBe("v1-lexical-term-overlap");
    expect(report.m9.retrievalVersion).toBe("v1-semantic-embedding");
    expect(report.m9.embedderLabel).toBe("offline:hash-projection-v1");
    expect(report.m8.metrics.map((row) => row.k)).toEqual([10, 25, 50, 100]);
    expect(report.m9.metrics.map((row) => row.k)).toEqual([10, 25, 50, 100]);
    expect(report.notes.some((note) => note.includes("SYNTHETIC"))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/candidateScore/);
  });

  it("reuses the same K bounds as lexical retrieval", () => {
    expect(validateSemanticRetrievalLimit(undefined)).toBe(100);
    expect(validateSemanticRetrievalLimit(25)).toBe(25);
    expect(() => validateSemanticRetrievalLimit(3000)).toThrow(
      "Limit must be between 1 and 2000.",
    );
  });
});
