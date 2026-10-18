import { canonicalSkillKey, impliedSkillKeys } from "@/lib/ontology/skill-alias";

export type FitSkill = { name: string; lastUsedYear: number };
export type FitCandidate = { id: string; skills: FitSkill[]; yearsExperience: number };
export type FitJob = { skills: string[]; minYears: number; targetYears: number };

export function recencyWeight(lastUsedYear: number, asOfYear: number) {
  const age = Math.max(0, asOfYear - lastUsedYear);
  return 0.5 ** (age / 4);
}

export function seniorityBand(years: number) {
  if (years < 1) return "intern";
  if (years < 3) return "junior";
  if (years < 6) return "mid";
  if (years < 10) return "senior";
  return "staff";
}

function skillCovers(have: string, need: string) {
  const left = canonicalSkillKey(have);
  const right = canonicalSkillKey(need);
  if (left === right) return true;
  return impliedSkillKeys(left).includes(right);
}

export function fitScore(candidate: FitCandidate, job: FitJob, asOfYear: number) {
  if (job.skills.length === 0) return 0;
  let covered = 0;
  for (const need of job.skills) {
    const hits = candidate.skills.filter((skill) => skillCovers(skill.name, need));
    if (hits.length === 0) continue;
    const best = Math.max(...hits.map((skill) => recencyWeight(skill.lastUsedYear, asOfYear)));
    covered += best;
  }
  const coverage = covered / job.skills.length;
  const yearsGap = Math.abs(candidate.yearsExperience - job.targetYears);
  const seniority = candidate.yearsExperience + 0.5 >= job.minYears ? 1 - Math.min(yearsGap, 8) / 16 : 0.25;
  return coverage * 0.75 + seniority * 0.25;
}

export function whyNot(candidate: FitCandidate, job: FitJob, asOfYear: number) {
  const missing = job.skills.filter(
    (need) => !candidate.skills.some((skill) => skillCovers(skill.name, need)),
  );
  const stale = job.skills.flatMap((need) => {
    const hits = candidate.skills.filter((skill) => skillCovers(skill.name, need));
    if (hits.length === 0) return [];
    const best = hits.reduce((left, right) =>
      recencyWeight(right.lastUsedYear, asOfYear) > recencyWeight(left.lastUsedYear, asOfYear) ? right : left,
    );
    return recencyWeight(best.lastUsedYear, asOfYear) < 0.5
      ? [`${need} was last used in ${best.lastUsedYear}`]
      : [];
  });
  const notes = [
    ...missing.map((skill) => `No evidence for ${skill}.`),
    ...stale.map((line) => `${line}, so it counts less.`),
  ];
  if (candidate.yearsExperience + 0.5 < job.minYears) {
    notes.push(`Experience is ${candidate.yearsExperience} years; the role asks for ${job.minYears}.`);
  }
  return notes;
}

export function spearman(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return 0;
  const n = left.length;
  let sum = 0;
  for (let index = 0; index < n; index += 1) {
    const diff = left[index] - right[index];
    sum += diff * diff;
  }
  return 1 - (6 * sum) / (n * (n * n - 1));
}
