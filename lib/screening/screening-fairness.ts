import { FOUR_FIFTHS, MIN_CELL_TO_SHOW, MIN_GROUP_FOR_FLAG, twoProportionP } from "@/lib/fairness/impact";
import { PREFER_NOT, SELF_ID_FIELDS } from "@/lib/fairness/self-id";
import { prisma } from "@/lib/prisma";
import type { Category } from "@/lib/screening/prioritization";
import { loadScreeningPool } from "@/lib/screening/screening-data";

/**
 * Four-fifths monitoring for the screening stages of one job. Uses only
 * voluntary self-identification, reported in aggregate. A flag is a prompt
 * to inspect a stage; it never changes a candidate's category or status.
 *
 * - Groups with fewer than 10 people in a stage's denominator are hidden.
 * - Only groups with at least 30 people are compared.
 * - A zero denominator gives no rate; a zero top rate gives no ratio.
 * - "Prefer not to say" and missing answers are counted but never compared.
 */

export type ScreeningFairnessStage = "basicSubmitted" | "practicalSubmitted" | "topApplicant";

export const SCREENING_FAIRNESS_STAGES: Array<{ key: ScreeningFairnessStage; label: string; base: string }> = [
  { key: "basicSubmitted", label: "Submitted the basic assessment", base: "candidates sent it" },
  { key: "practicalSubmitted", label: "Submitted the practical", base: "candidates assigned it" },
  { key: "topApplicant", label: "Placed in Top applicants", base: "open applicants with a complete result" },
];

export type FairnessSubject = {
  group: string | null;
  inBase: boolean;
  passed: boolean;
};

export type FourFifthsGroup = { group: string; people: number; passed: number; rate: number | null; hidden: boolean };

export type FourFifthsResult = {
  groups: FourFifthsGroup[];
  undisclosed: number;
  impactRatio: number | null;
  compared: [string, string] | null;
  pValue: number | null;
  flagged: boolean;
  limitation: string | null;
};

export function fourFifths(subjects: FairnessSubject[]): FourFifthsResult {
  const base = subjects.filter((row) => row.inBase);
  const undisclosed = base.filter((row) => !row.group || row.group === PREFER_NOT).length;
  const disclosed = base.filter((row) => row.group && row.group !== PREFER_NOT) as Array<FairnessSubject & { group: string }>;
  const names = [...new Set(disclosed.map((row) => row.group))].sort();
  const groups = names.map((group) => {
    const members = disclosed.filter((row) => row.group === group);
    const passed = members.filter((row) => row.passed).length;
    const hidden = members.length < MIN_CELL_TO_SHOW;
    return {
      group,
      people: hidden ? 0 : members.length,
      passed: hidden ? 0 : passed,
      rate: hidden || members.length === 0 ? null : passed / members.length,
      hidden,
      rawPeople: members.length,
      rawPassed: passed,
    };
  });
  const comparable = groups.filter((row) => row.rawPeople >= MIN_GROUP_FOR_FLAG && row.rate !== null);
  const sorted = [...comparable].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || a.group.localeCompare(b.group));
  const highest = sorted[0] ?? null;
  const lowest = sorted[sorted.length - 1] ?? null;
  let limitation: string | null = null;
  if (comparable.length < 2) {
    limitation = `Fewer than two self-identified groups have ${MIN_GROUP_FOR_FLAG} or more people at this stage, so no comparison is made.`;
  } else if (highest && highest.rate === 0) {
    limitation = "No one in the compared groups passed this stage, so a ratio is undefined.";
  }
  const usable = !limitation && highest && lowest && highest.group !== lowest.group;
  const impactRatio = usable ? (lowest!.rate ?? 0) / highest!.rate! : null;
  return {
    groups: groups.map((row) => ({ group: row.group, people: row.people, passed: row.passed, rate: row.rate, hidden: row.hidden })),
    undisclosed,
    impactRatio: impactRatio === null ? null : Math.round(impactRatio * 1000) / 1000,
    compared: usable ? [lowest!.group, highest!.group] : null,
    pValue: usable
      ? twoProportionP({ passedA: lowest!.rawPassed, sizeA: lowest!.rawPeople, passedB: highest!.rawPassed, sizeB: highest!.rawPeople })
      : null,
    flagged: impactRatio !== null && impactRatio < FOUR_FIFTHS,
    limitation,
  };
}

const COMPLETE: Category[] = ["TOP", "POSSIBLE_FIT", "WEAK_EVIDENCE"];

export async function loadScreeningFairness(jobId: number, companyId: number) {
  const pool = await loadScreeningPool(jobId, companyId);
  if (!pool) return null;
  const applications = await prisma.application.findMany({
    where: { id: { in: pool.rows.map((row) => row.applicationId) }, companyId },
    select: { id: true, candidateId: true },
  });
  const candidateOf = new Map(applications.map((row) => [row.id, row.candidateId]));
  const selfIds = await prisma.candidateSelfIdentification.findMany({
    where: { companyId, candidateId: { in: [...new Set(applications.map((row) => row.candidateId))] } },
    select: { candidateId: true, gender: true, ageBand: true, disability: true, region: true },
  });
  const byCandidate = new Map(selfIds.map((row) => [row.candidateId, row]));
  const status = (row: (typeof pool.rows)[number]) => ({
    basicSent: row.evaluation.components.basic.status !== "NOT_INVITED",
    basicSubmitted: ["COMPLETED", "PENDING_GRADING"].includes(row.evaluation.components.basic.status),
    practicalAssigned: row.practicalId !== null,
    practicalSubmitted: ["GRADED", "PENDING_GRADING"].includes(row.evaluation.components.practical.status),
    complete: COMPLETE.includes(row.evaluation.category),
    top: row.evaluation.category === "TOP",
  });

  const dimensions = SELF_ID_FIELDS.map((field) => {
    const groupOf = (applicationId: number) => {
      const selfId = byCandidate.get(candidateOf.get(applicationId) ?? -1);
      return selfId ? (selfId[field] as string) : null;
    };
    const stages = SCREENING_FAIRNESS_STAGES.map((stage) => {
      const subjects = pool.rows.map((row) => {
        const s = status(row);
        const group = groupOf(row.applicationId);
        if (stage.key === "basicSubmitted") return { group, inBase: s.basicSent, passed: s.basicSubmitted };
        if (stage.key === "practicalSubmitted") return { group, inBase: s.practicalAssigned, passed: s.practicalSubmitted };
        return { group, inBase: !row.closed && s.complete, passed: s.top };
      });
      return { ...stage, result: fourFifths(subjects) };
    });
    return { field, stages };
  });
  return { applicants: pool.rows.length, selfIdentified: selfIds.length, dimensions };
}
