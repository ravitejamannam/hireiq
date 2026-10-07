import {
  LEXICAL_RETRIEVAL_VERSION,
} from "@/lib/retrieval/lexical-retrieval-versions";
import { SEMANTIC_RETRIEVAL_VERSION } from "@/lib/retrieval/semantic-retrieval-versions";
import {
  HYBRID_RETRIEVAL_BASELINE_INCOMPATIBLE,
  HybridRetrievalError,
} from "@/lib/retrieval/hybrid-retrieval-errors";
import type { HybridBaselineRunView } from "@/lib/retrieval/hybrid-retrieval-types";

export function assertCompatibleHybridBaselines(input: {
  companyId: number;
  jobId: number;
  lexical: HybridBaselineRunView;
  semantic: HybridBaselineRunView;
  limit: number;
}) {
  const problems: string[] = [];
  for (const [label, run, version] of [
    ["Lexical", input.lexical, LEXICAL_RETRIEVAL_VERSION],
    ["Semantic", input.semantic, SEMANTIC_RETRIEVAL_VERSION],
  ] as const) {
    if (run.companyId !== input.companyId) {
      problems.push(`${label} run is outside this company.`);
    }
    if (run.jobId !== input.jobId) {
      problems.push(`${label} run is for a different job.`);
    }
    if (run.status !== "COMPLETED") {
      problems.push(`${label} run is not completed.`);
    }
    if (run.retrievalVersion !== version) {
      problems.push(`${label} run uses a different retrieval version.`);
    }
    if (run.resultLimit < input.limit) {
      problems.push(`${label} run limit is smaller than the requested hybrid limit.`);
    }
  }
  if (input.lexical.jobSpecificationVersionId !== input.semantic.jobSpecificationVersionId) {
    problems.push("Baseline runs use different published specifications.");
  }
  if (problems.length > 0) {
    throw new HybridRetrievalError(
      problems[0] ?? "Baseline runs are incompatible.",
      HYBRID_RETRIEVAL_BASELINE_INCOMPATIBLE,
    );
  }
}
