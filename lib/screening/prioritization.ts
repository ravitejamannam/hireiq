import type { ScreeningPolicy } from "@/lib/screening/screening-policy";

/**
 * Deterministic candidate prioritization for one job.
 *
 * Eligibility, demonstrated skill, evidence, and completion stay separate.
 * A combined score exists only when every weighted component is present and
 * comparable. Missing results are never read as zero. Nothing here changes an
 * application's status; a recruiter does that.
 */

export const PRIORITIZATION_VERSION = "screening-priority-1";
/** Combined scores closer than this are shown as a tie, not an ordering. */
export const CLOSE_SCORE_GAP = 2;
const DISAGREEMENT_GAP = 30;
const SPARSE_EVIDENCE_PERCENT = 50;
const STRONG_PRACTICAL_FALLBACK = 70;
/** Without a configured threshold, a complete combined score below this is "Weak evidence". */
export const WEAK_COMBINED_PERCENT = 50;

export type BasicInput =
  | { state: "NOT_INVITED" }
  | { state: "INVITED"; deadline: Date }
  | { state: "IN_PROGRESS"; deadline: Date }
  | { state: "EXPIRED" }
  | { state: "PENDING_GRADING"; versionKey: string }
  | { state: "COMPLETED"; percent: number; versionKey: string };

export type PracticalInput =
  | { state: "NOT_ASSIGNED" }
  | { state: "ASSIGNED"; dueAt: Date | null }
  | { state: "OVERDUE" }
  | { state: "PENDING_GRADING"; versionKey: string }
  | { state: "GRADED"; percent: number; versionKey: string };

export type EvidenceInput =
  | { state: "NOT_ANALYSED" }
  | { state: "OPTED_OUT" }
  | { state: "NO_REQUIREMENTS" }
  | { state: "ANALYSED"; supported: number; total: number; source: "APPROVED_REQUIREMENTS" | "MATCHER_V1" };

export type EligibilityInput = {
  knockoutFailed: boolean;
  /** Approved REQUIRED items a person marked NOT_MET. */
  requiredNotMet: number;
  /** Approved REQUIRED items with no supporting evidence yet. Unknown is not a failure. */
  requiredUnknown: number;
};

export type CandidateInput = {
  applicationId: number;
  /** REJECTED, HIRED, or withdrawn. Still listed under All applicants. */
  closed: boolean;
  humanReviewRequested: boolean;
  parseIssue: boolean;
  basic: BasicInput;
  practical: PracticalInput;
  evidence: EvidenceInput;
  eligibility: EligibilityInput;
};

export type Standard = "MEETS" | "BORDERLINE" | "BELOW" | "INCOMPLETE" | "NO_THRESHOLD";
export type Eligibility = "MET" | "NOT_MET" | "UNVERIFIED";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type ComponentKey = "basic" | "practical" | "evidence";

/**
 * Every applicant is in exactly one category.
 * TOP: complete, comparable, meets the standard (or none is set), not weak, within review capacity.
 * POSSIBLE_FIT: complete and comparable but not TOP (outside capacity or borderline).
 * WEAK_EVIDENCE: complete, but below the configured standard, or below 50 combined when no standard is set.
 * NOT_MET: a must-have answer or essential requirement was marked not met. Never closed automatically.
 * NEEDS_INFO: results exist but cannot be compared or trusted without a person (version mismatch,
 *   human review requested, opted out of automated evidence, unreadable resume, expired or overdue stage).
 * IN_PROGRESS: still waiting on an assessment or grade; no score is invented meanwhile.
 * CLOSED: rejected, hired, or withdrawn.
 */
export type Category = "TOP" | "POSSIBLE_FIT" | "WEAK_EVIDENCE" | "NOT_MET" | "NEEDS_INFO" | "IN_PROGRESS" | "CLOSED";

export const CATEGORY_LABELS: Record<Category, string> = {
  TOP: "Top applicants",
  POSSIBLE_FIT: "Possible fit",
  WEAK_EVIDENCE: "Weak evidence",
  NOT_MET: "Doesn't meet stated requirements",
  NEEDS_INFO: "Needs review: insufficient information",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
};

export const SCREENING_VIEWS = [
  { key: "top", label: "Top applicants" },
  { key: "possible", label: "Possible fit" },
  { key: "weak", label: "Weak evidence" },
  { key: "not_met", label: "Doesn't meet stated requirements" },
  { key: "needs_info", label: "Needs review: insufficient information" },
  { key: "assessment", label: "Assessment incomplete" },
  { key: "practical", label: "Practical pending" },
  { key: "all", label: "All applicants" },
] as const;

export type ScreeningView = (typeof SCREENING_VIEWS)[number]["key"];

const CATEGORY_VIEW: Partial<Record<Category, ScreeningView>> = {
  TOP: "top",
  POSSIBLE_FIT: "possible",
  WEAK_EVIDENCE: "weak",
  NOT_MET: "not_met",
  NEEDS_INFO: "needs_info",
};

export type FlagCode =
  | "KNOCKOUT_FAILED"
  | "REQUIRED_NOT_MET"
  | "ELIGIBILITY_UNVERIFIED"
  | "HUMAN_REVIEW_REQUESTED"
  | "AI_OPT_OUT"
  | "PARSE_ISSUE"
  | "BASIC_INCOMPARABLE"
  | "PRACTICAL_INCOMPARABLE"
  | "PENDING_HUMAN_GRADING"
  | "NEAR_THRESHOLD"
  | "COMPONENT_DISAGREEMENT"
  | "STRONG_PRACTICAL_SPARSE_EVIDENCE"
  | "CLOSE_TO_NEIGHBOUR"
  | "ASSESSMENT_EXPIRED"
  | "PRACTICAL_OVERDUE";

export type Flag = { code: FlagCode; message: string };

export type ComponentResult = {
  /** 0–100, one decimal. Null when there is no usable result. */
  percent: number | null;
  /** False when the result came from a different assessment or rubric version than the pool reference. */
  comparable: boolean;
  status: string;
  weight: number;
  threshold: number | null;
};

export type CandidateEvaluation = {
  applicationId: number;
  components: Record<ComponentKey, ComponentResult>;
  combined: number | null;
  /** Weighted components that block a combined score. */
  missing: ComponentKey[];
  completeness: { present: number; required: number };
  standard: Standard;
  eligibility: Eligibility;
  confidence: Confidence;
  flags: Flag[];
  rank: number | null;
  /** True when the candidate is in Top applicants. */
  priority: boolean;
  category: Category;
  nextAction: string;
  views: ScreeningView[];
};

export type PoolSummary = {
  version: typeof PRIORITIZATION_VERSION;
  policyId: number | null;
  policyVersion: number | null;
  thresholdsConfigured: boolean;
  reference: { basic: string | null; practical: string | null };
  capacity: number;
  meetsCount: number;
  rankedCount: number;
  priorityCount: number;
  capacityNote: string | null;
  viewCounts: Record<ScreeningView, number>;
  categoryCounts: Record<Category, number>;
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Most common version among finished results. Ties go to the greater key, so the choice is stable. */
export function referenceKey(keys: string[]): string | null {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && key > best)) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

type ThresholdOutcome = "MEETS" | "BORDERLINE" | "BELOW" | "INCOMPLETE" | null;

function thresholdOutcome(percent: number | null, threshold: number | null, band: number): ThresholdOutcome {
  if (threshold === null) return null;
  if (percent === null) return "INCOMPLETE";
  if (percent >= threshold) return "MEETS";
  if (percent >= threshold - band) return "BORDERLINE";
  return "BELOW";
}

function basicComponent(input: BasicInput, reference: string | null, policy: ScreeningPolicy): ComponentResult {
  const base = { weight: policy.basicWeight, threshold: policy.basicPassPercent };
  if (input.state === "COMPLETED") {
    return { ...base, percent: round1(input.percent), comparable: input.versionKey === reference, status: "COMPLETED" };
  }
  return { ...base, percent: null, comparable: true, status: input.state };
}

function practicalComponent(input: PracticalInput, reference: string | null, policy: ScreeningPolicy): ComponentResult {
  const base = { weight: policy.practicalWeight, threshold: policy.practicalPassPercent };
  if (input.state === "GRADED") {
    return { ...base, percent: round1(input.percent), comparable: input.versionKey === reference, status: "GRADED" };
  }
  return { ...base, percent: null, comparable: true, status: input.state };
}

function evidenceComponent(input: EvidenceInput, policy: ScreeningPolicy): ComponentResult {
  const base = { weight: policy.evidenceWeight, threshold: null };
  if (input.state === "ANALYSED" && input.total > 0) {
    return { ...base, percent: round1((input.supported / input.total) * 100), comparable: true, status: input.source };
  }
  return { ...base, percent: null, comparable: true, status: input.state };
}

function eligibilityOf(input: EligibilityInput): Eligibility {
  if (input.knockoutFailed || input.requiredNotMet > 0) return "NOT_MET";
  if (input.requiredUnknown > 0) return "UNVERIFIED";
  return "MET";
}

function matters(component: ComponentResult) {
  return component.weight > 0 || component.threshold !== null;
}

type Draft = Omit<CandidateEvaluation, "rank" | "priority" | "category" | "nextAction" | "views">;

function evaluateOne(input: CandidateInput, policy: ScreeningPolicy, reference: PoolSummary["reference"]): Draft {
  const components = {
    basic: basicComponent(input.basic, reference.basic, policy),
    practical: practicalComponent(input.practical, reference.practical, policy),
    evidence: evidenceComponent(input.evidence, policy),
  };
  const keys: ComponentKey[] = ["basic", "practical", "evidence"];
  const weighted = keys.filter((key) => components[key].weight > 0);
  const missing = weighted.filter((key) => components[key].percent === null || !components[key].comparable);
  const combined =
    weighted.length > 0 && missing.length === 0
      ? round1(weighted.reduce((sum, key) => sum + (components[key].percent ?? 0) * components[key].weight, 0) / 100)
      : null;

  const band = policy.borderlineBandPercent;
  const outcomes = [
    thresholdOutcome(components.basic.percent, components.basic.threshold, band),
    thresholdOutcome(components.practical.percent, components.practical.threshold, band),
  ].filter((value): value is NonNullable<ThresholdOutcome> => value !== null);
  const standard: Standard =
    outcomes.length === 0
      ? "NO_THRESHOLD"
      : outcomes.includes("BELOW")
        ? "BELOW"
        : outcomes.includes("BORDERLINE")
          ? "BORDERLINE"
          : outcomes.includes("INCOMPLETE")
            ? "INCOMPLETE"
            : "MEETS";

  const eligibility = eligibilityOf(input.eligibility);
  const flags: Flag[] = [];
  if (input.eligibility.knockoutFailed) flags.push({ code: "KNOCKOUT_FAILED", message: "Failed a recruiter-defined knockout question." });
  if (input.eligibility.requiredNotMet > 0) {
    flags.push({ code: "REQUIRED_NOT_MET", message: `${input.eligibility.requiredNotMet} essential requirement(s) marked not met by a reviewer.` });
  }
  if (eligibility === "UNVERIFIED") {
    flags.push({ code: "ELIGIBILITY_UNVERIFIED", message: `${input.eligibility.requiredUnknown} essential requirement(s) have no supporting evidence yet. This is not a failure.` });
  }
  if (input.humanReviewRequested) flags.push({ code: "HUMAN_REVIEW_REQUESTED", message: "Candidate asked for a human review." });
  if (input.evidence.state === "OPTED_OUT") flags.push({ code: "AI_OPT_OUT", message: "Candidate opted out of automated evidence matching. Review the resume manually." });
  if (input.parseIssue) flags.push({ code: "PARSE_ISSUE", message: "Resume text extraction was low quality or incomplete." });
  if (components.basic.percent !== null && !components.basic.comparable) {
    flags.push({ code: "BASIC_INCOMPARABLE", message: "Took a different basic assessment version than most applicants. Not ranked against them." });
  }
  if (components.practical.percent !== null && !components.practical.comparable) {
    flags.push({ code: "PRACTICAL_INCOMPARABLE", message: "Practical graded on a different rubric version than most applicants. Not ranked against them." });
  }
  if (input.basic.state === "PENDING_GRADING" || input.practical.state === "PENDING_GRADING") {
    flags.push({ code: "PENDING_HUMAN_GRADING", message: "Submitted work is waiting for a human grade." });
  }
  if (input.basic.state === "EXPIRED") flags.push({ code: "ASSESSMENT_EXPIRED", message: "Basic assessment window closed before submission." });
  if (input.practical.state === "OVERDUE") flags.push({ code: "PRACTICAL_OVERDUE", message: "Practical assignment passed its deadline without a submission." });
  for (const key of ["basic", "practical"] as const) {
    const component = components[key];
    if (component.percent !== null && component.threshold !== null && Math.abs(component.percent - component.threshold) < band) {
      flags.push({ code: "NEAR_THRESHOLD", message: `${key === "basic" ? "Basic" : "Practical"} result is within ${band} points of the threshold.` });
    }
  }
  if (
    components.basic.percent !== null &&
    components.practical.percent !== null &&
    Math.abs(components.basic.percent - components.practical.percent) >= DISAGREEMENT_GAP
  ) {
    flags.push({ code: "COMPONENT_DISAGREEMENT", message: "Basic and practical results disagree by 30 points or more." });
  }
  const strongBar = components.practical.threshold ?? STRONG_PRACTICAL_FALLBACK;
  const evidencePercent = components.evidence.percent;
  if (
    components.practical.percent !== null &&
    components.practical.percent >= strongBar &&
    (evidencePercent === null || evidencePercent < SPARSE_EVIDENCE_PERCENT)
  ) {
    flags.push({
      code: "STRONG_PRACTICAL_SPARSE_EVIDENCE",
      message: "Strong practical work with sparse resume evidence. Missing resume keywords are not proof of a missing skill.",
    });
  }

  const present = weighted.filter((key) => components[key].percent !== null).length;
  const evidenceThin =
    input.evidence.state !== "ANALYSED" || input.evidence.total < 3 || input.evidence.source === "MATCHER_V1";
  const confidence: Confidence =
    combined === null || flags.some((flag) => flag.code === "BASIC_INCOMPARABLE" || flag.code === "PRACTICAL_INCOMPARABLE")
      ? "LOW"
      : (input.parseIssue && components.evidence.weight > 0) || evidenceThin || flags.some((flag) => flag.code === "COMPONENT_DISAGREEMENT")
        ? "MEDIUM"
        : "HIGH";

  return {
    applicationId: input.applicationId,
    components,
    combined,
    missing,
    completeness: { present, required: weighted.length },
    standard,
    eligibility,
    confidence,
    flags,
  };
}

function compareRanked(left: Draft, right: Draft) {
  return (
    (right.combined ?? 0) - (left.combined ?? 0) ||
    (right.components.practical.percent ?? -1) - (left.components.practical.percent ?? -1) ||
    (right.components.basic.percent ?? -1) - (left.components.basic.percent ?? -1) ||
    left.applicationId - right.applicationId
  );
}

const REVIEW_FLAGS = new Set<FlagCode>([
  "REQUIRED_NOT_MET",
  "HUMAN_REVIEW_REQUESTED",
  "BASIC_INCOMPARABLE",
  "PRACTICAL_INCOMPARABLE",
  "COMPONENT_DISAGREEMENT",
  "STRONG_PRACTICAL_SPARSE_EVIDENCE",
]);

const NEEDS_INFO_FLAGS = new Set<FlagCode>([
  "HUMAN_REVIEW_REQUESTED",
  "BASIC_INCOMPARABLE",
  "PRACTICAL_INCOMPARABLE",
  "ASSESSMENT_EXPIRED",
  "PRACTICAL_OVERDUE",
]);

function needsInfo(input: CandidateInput, draft: Draft) {
  if (draft.flags.some((flag) => NEEDS_INFO_FLAGS.has(flag.code))) return true;
  const evidenceNeeded = draft.components.evidence.weight > 0;
  return evidenceNeeded && (input.evidence.state === "OPTED_OUT" || (input.parseIssue && draft.components.evidence.percent === null));
}

function nextActionFor(input: CandidateInput, evaluation: Draft, priority: boolean, thresholds: boolean): string {
  if (input.closed) return "No action. Application is closed.";
  if (evaluation.eligibility === "NOT_MET") return "Verify the essential requirement before progressing.";
  const basic = evaluation.components.basic;
  if (matters(basic)) {
    switch (input.basic.state) {
      case "NOT_INVITED":
        return "Send the basic assessment.";
      case "INVITED":
        return "Waiting for the candidate to start the basic assessment.";
      case "IN_PROGRESS":
        return "Waiting for the candidate to submit the basic assessment.";
      case "EXPIRED":
        return "Assessment window closed. Decide whether to send a new link.";
      case "PENDING_GRADING":
        return "Grade the written answers.";
    }
  }
  if (evaluation.standard === "BELOW") return "Below the configured standard. Review the result and record a decision.";
  const practical = evaluation.components.practical;
  if (matters(practical)) {
    switch (input.practical.state) {
      case "NOT_ASSIGNED":
        return "Assign the practical assessment.";
      case "ASSIGNED":
        return "Waiting for the practical submission.";
      case "OVERDUE":
        return "Practical is overdue. Follow up or extend the deadline.";
      case "PENDING_GRADING":
        return "Grade the practical submission.";
    }
  }
  if (evaluation.components.evidence.weight > 0) {
    if (input.evidence.state === "NOT_ANALYSED") return "Run evidence analysis on the resume.";
    if (input.evidence.state === "OPTED_OUT") return "Review the resume manually.";
    if (input.evidence.state === "NO_REQUIREMENTS") return "Approve job requirements, or set the evidence weight to 0.";
  }
  if (evaluation.standard === "BORDERLINE") return "Borderline result. Review the evidence before deciding.";
  if (evaluation.flags.some((flag) => REVIEW_FLAGS.has(flag.code))) return "Review the flagged evidence.";
  if (priority) return thresholds ? "Review for shortlist." : "Review for shortlist. No threshold is set, so this order is relative only.";
  if (evaluation.standard === "MEETS") return "Meets the standard. Outside the current review capacity.";
  return "Review the result and record a decision.";
}

export function prioritizeCandidates(inputs: CandidateInput[], policy: ScreeningPolicy) {
  const reference = {
    basic: referenceKey(inputs.flatMap((row) => (row.basic.state === "COMPLETED" ? [row.basic.versionKey] : []))),
    practical: referenceKey(inputs.flatMap((row) => (row.practical.state === "GRADED" ? [row.practical.versionKey] : []))),
  };
  const thresholds = policy.basicPassPercent !== null || policy.practicalPassPercent !== null;
  const drafts = inputs.map((input) => ({ input, draft: evaluateOne(input, policy, reference) }));

  const open = (row: { input: CandidateInput; draft: Draft }) => !row.input.closed && row.draft.eligibility !== "NOT_MET";
  const ranked = drafts.filter((row) => !row.input.closed && row.draft.combined !== null).sort((a, b) => compareRanked(a.draft, b.draft));
  const rankOf = new Map(ranked.map((row, index) => [row.input.applicationId, index + 1]));
  const close = new Set<number>();
  for (let index = 1; index < ranked.length; index += 1) {
    const above = ranked[index - 1]!.draft;
    const here = ranked[index]!.draft;
    if ((above.combined ?? 0) - (here.combined ?? 0) < CLOSE_SCORE_GAP) {
      close.add(above.applicationId);
      close.add(here.applicationId);
    }
  }
  const weak = (draft: Draft) =>
    draft.standard === "BELOW" || (draft.combined !== null && !thresholds && draft.combined < WEAK_COMBINED_PERCENT);
  const qualifies = (draft: Draft) =>
    !weak(draft) && (draft.standard === "MEETS" || (!thresholds && draft.standard === "NO_THRESHOLD"));
  const priorityIds = new Set(
    ranked
      .filter((row) => open(row) && qualifies(row.draft) && !needsInfo(row.input, row.draft))
      .slice(0, policy.reviewCapacity)
      .map((row) => row.input.applicationId),
  );

  const evaluations: CandidateEvaluation[] = drafts.map(({ input, draft }) => {
    const flags = close.has(input.applicationId)
      ? [...draft.flags, { code: "CLOSE_TO_NEIGHBOUR" as const, message: `Within ${CLOSE_SCORE_GAP} points of an adjacent candidate. Treat the order as a tie.` }]
      : draft.flags;
    const evaluation = { ...draft, flags };
    const priority = priorityIds.has(input.applicationId);
    const category: Category = input.closed
      ? "CLOSED"
      : draft.eligibility === "NOT_MET"
        ? "NOT_MET"
        : needsInfo(input, draft)
          ? "NEEDS_INFO"
          : weak(draft)
            ? "WEAK_EVIDENCE"
            : draft.combined === null
              ? "IN_PROGRESS"
              : priority
                ? "TOP"
                : "POSSIBLE_FIT";
    const views: ScreeningView[] = ["all"];
    const categoryView = CATEGORY_VIEW[category];
    if (categoryView) views.push(categoryView);
    if (!input.closed) {
      if (matters(draft.components.basic) && input.basic.state !== "COMPLETED") views.push("assessment");
      const basicDone = !matters(draft.components.basic) || input.basic.state === "COMPLETED";
      if (
        matters(draft.components.practical) &&
        basicDone &&
        draft.standard !== "BELOW" &&
        input.practical.state !== "GRADED"
      ) {
        views.push("practical");
      }
    }
    return {
      ...evaluation,
      rank: rankOf.get(input.applicationId) ?? null,
      priority,
      category,
      nextAction: nextActionFor(input, evaluation, priority, thresholds),
      views,
    };
  });

  const viewCounts = Object.fromEntries(
    SCREENING_VIEWS.map(({ key }) => [key, evaluations.filter((row) => row.views.includes(key)).length]),
  ) as Record<ScreeningView, number>;
  const categoryCounts = Object.fromEntries(
    (Object.keys(CATEGORY_LABELS) as Category[]).map((category) => [
      category,
      evaluations.filter((row) => row.category === category).length,
    ]),
  ) as Record<Category, number>;
  const qualifiedOpen = drafts.filter((row) => open(row) && qualifies(row.draft));
  const qualifiedRanked = qualifiedOpen.filter((row) => row.draft.combined !== null).length;
  const meetsCount = evaluations.filter(
    (row) => row.category !== "CLOSED" && row.eligibility !== "NOT_MET" && row.standard === "MEETS",
  ).length;
  let capacityNote: string | null = null;
  if (!thresholds) {
    capacityNote =
      "No qualification threshold is set. Priority review is ordered by the combined score only and does not show that anyone meets the job's requirements.";
  } else if (qualifiedRanked < policy.reviewCapacity) {
    capacityNote = `${qualifiedRanked} candidate(s) meet the standard with a complete, comparable result. Review capacity is ${policy.reviewCapacity}. The shortlist is not padded with candidates below the standard.`;
  } else if (qualifiedRanked > policy.reviewCapacity) {
    capacityNote = `${qualifiedRanked} candidates meet the standard. Top applicants shows the first ${policy.reviewCapacity}. The rest still meet the standard and are listed under Possible fit.`;
  }

  const summary: PoolSummary = {
    version: PRIORITIZATION_VERSION,
    policyId: policy.id,
    policyVersion: policy.version,
    thresholdsConfigured: thresholds,
    reference,
    capacity: policy.reviewCapacity,
    meetsCount,
    rankedCount: ranked.length,
    priorityCount: priorityIds.size,
    capacityNote,
    viewCounts,
    categoryCounts,
  };
  return { evaluations, summary };
}
