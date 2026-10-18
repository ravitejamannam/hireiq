export const FOUR_FIFTHS = 0.8;
export const MIN_GROUP_FOR_FLAG = 30;
export const MIN_CELL_TO_SHOW = 10;
export const AI_SHORTLIST_COVERAGE = 0.5;

export const FAIRNESS_STAGES = ["applied", "aiShortlist", "advanced", "interviewed", "offer", "rediscoveryInvite"] as const;
export type FairnessStage = (typeof FAIRNESS_STAGES)[number];

export type FairnessPerson = {
  jobId: number;
  group: string;
  applied: boolean;
  aiShortlist: boolean;
  advanced: boolean;
  interviewed: boolean;
  offer: boolean;
  rediscoveryInvite: boolean;
  aiGrade: number | null;
  humanOverride: boolean;
  requirements: Array<{ key: string; passed: boolean }>;
};

export type GroupRate = {
  group: string;
  people: number;
  passed: number;
  rate: number | null;
  hidden: boolean;
};

export type StageReport = {
  stage: FairnessStage;
  groups: GroupRate[];
  impactRatio: number | null;
  compared: [string, string] | null;
  pValue: number | null;
  flagged: boolean;
  note: string;
};

const STAGE_NOTE =
  "A flag means one group's pass rate is under four-fifths of the highest group's rate, and both groups have at least 30 people. It is a prompt to inspect the requirement, not a hiring decision. Counts under 10 are hidden.";

function reached(person: FairnessPerson, stage: FairnessStage) {
  return person[stage];
}

function previousStage(stage: FairnessStage): FairnessStage | null {
  if (stage === "applied" || stage === "rediscoveryInvite") return null;
  const order: FairnessStage[] = ["applied", "aiShortlist", "advanced", "interviewed", "offer"];
  const index = order.indexOf(stage);
  return order[index - 1] ?? null;
}

export function formatPValue(p: number) {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export function normalTwoTailP(z: number) {
  const abs = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * abs);
  const d = 0.3989422804 * Math.exp(-0.5 * abs * abs);
  const probability = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, Math.max(0, 2 * probability));
}

export function twoProportionP(input: { passedA: number; sizeA: number; passedB: number; sizeB: number }) {
  if (input.sizeA === 0 || input.sizeB === 0) return null;
  const pool = (input.passedA + input.passedB) / (input.sizeA + input.sizeB);
  const variance = pool * (1 - pool) * (1 / input.sizeA + 1 / input.sizeB);
  if (variance <= 0) return 1;
  const z = (input.passedA / input.sizeA - input.passedB / input.sizeB) / Math.sqrt(variance);
  return normalTwoTailP(z);
}

export function stageReport(people: FairnessPerson[], stage: FairnessStage): StageReport {
  const groups = [...new Set(people.map((person) => person.group))];
  const rates: GroupRate[] = groups.map((group) => {
    const members = people.filter((person) => person.group === group);
    const baseStage = previousStage(stage);
    const base = baseStage ? members.filter((person) => reached(person, baseStage)) : members.filter((person) => person.applied || stage === "rediscoveryInvite");
    const passed = base.filter((person) => reached(person, stage));
    const peopleCount = base.length;
    return {
      group,
      people: peopleCount,
      passed: passed.length,
      rate: peopleCount === 0 ? null : passed.length / peopleCount,
      hidden: peopleCount < MIN_CELL_TO_SHOW,
    };
  });
  const comparable = rates.filter((rate) => rate.people >= MIN_GROUP_FOR_FLAG && rate.rate != null);
  const highest = comparable.reduce<GroupRate | null>((best, rate) => (!best || (rate.rate ?? 0) > (best.rate ?? 0) ? rate : best), null);
  const lowest = comparable.reduce<GroupRate | null>((best, rate) => (!best || (rate.rate ?? 1) < (best.rate ?? 1) ? rate : best), null);
  const impactRatio = highest && lowest && highest.rate ? (lowest.rate ?? 0) / highest.rate : null;
  const pValue = highest && lowest
    ? twoProportionP({ passedA: lowest.passed, sizeA: lowest.people, passedB: highest.passed, sizeB: highest.people })
    : null;
  const flagged = impactRatio != null && impactRatio < FOUR_FIFTHS && highest?.group !== lowest?.group;
  return {
    stage,
    groups: rates,
    impactRatio,
    compared: highest && lowest && highest.group !== lowest.group ? [lowest.group, highest.group] : null,
    pValue,
    flagged,
    note: flagged
      ? `${lowest?.group} passes this stage at ${Math.round((impactRatio ?? 0) * 100)}% of ${highest?.group}'s rate. Check the requirement that separates them. This does not change any candidate's outcome.`
      : STAGE_NOTE,
  };
}

export function requirementGap(people: FairnessPerson[]) {
  const keys = [...new Set(people.flatMap((person) => person.requirements.map((item) => item.key)))];
  let worst: { key: string; impactRatio: number } | null = null;
  for (const key of keys) {
    const shaped = people.map((person) => {
      const item = person.requirements.find((requirement) => requirement.key === key);
      return { ...person, applied: true, aiShortlist: Boolean(item?.passed), advanced: false, interviewed: false, offer: false, rediscoveryInvite: false };
    });
    const report = stageReport(shaped, "aiShortlist");
    if (report.flagged && report.impactRatio != null && (!worst || report.impactRatio < worst.impactRatio)) {
      worst = { key, impactRatio: report.impactRatio };
    }
  }
  return worst;
}

export function newFlagKeys(previous: string[], next: string[]) {
  const seen = new Set(previous);
  return next.filter((key) => !seen.has(key));
}

export function flagKey(input: { jobId: number; dimension: string; stage: FairnessStage }) {
  return `job:${input.jobId}:${input.dimension}:${input.stage}`;
}

export function overrideGap(people: FairnessPerson[]) {
  const withGrade = people.filter((person) => person.aiGrade != null);
  return stageReport(withGrade.map((person) => ({ ...person, applied: true, aiShortlist: person.humanOverride })), "aiShortlist");
}
