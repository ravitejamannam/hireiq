/**
 * Score the 219 DataTurks fixtures. Seed 20261019: 179 tune, 40 hold-out.
 *   pnpm exec tsx scripts/score-dataturks-fixtures.ts tune
 *   pnpm exec tsx scripts/score-dataturks-fixtures.ts holdout
 * Hold-out is scored once, after tune fixes are frozen.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import {
  employersNearMatch,
  skillLabelTokens,
  skillsMatch,
  verifiedSkill,
} from "@/lib/resumes/fixture-score";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";

const SEED = 20261019;
const TUNE_COUNT = 179;

type Fixture = {
  id: string;
  text: string;
  titles: string[];
  companies: string[];
  skills: string[];
  credentials: string[];
};

type Corrections = {
  dropTitles: Array<{ id: string; label: string }>;
  dropCompanies: Array<{ id: string; label: string }>;
  replaceCompanies: Array<{ id: string; from: string; to: string }>;
};

function loadCorrections(): Corrections {
  const file = path.join(process.cwd(), ".data/resumes/label-corrections.json");
  return JSON.parse(readFileSync(file, "utf8")) as Corrections;
}

function correctedFixture(row: Fixture, corrections: Corrections): Fixture {
  const dropTitles = new Set(corrections.dropTitles.filter((item) => item.id === row.id).map((item) => item.label));
  const dropCompanies = new Set(corrections.dropCompanies.filter((item) => item.id === row.id).map((item) => item.label));
  const replacements = corrections.replaceCompanies.filter((item) => item.id === row.id);
  return {
    ...row,
    titles: row.titles.filter((label) => !dropTitles.has(label)),
    companies: row.companies.flatMap((label) => {
      if (dropCompanies.has(label)) return [];
      const replacement = replacements.find((item) => item.from === label);
      return [replacement ? replacement.to : label];
    }),
  };
}

function loadEnvFile() {
  const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "OPENAI_API_KEY" || process.env[key] === undefined) process.env[key] = value;
  }
}

function mix(state: number) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

export function dataturksSplit(ids: string[]) {
  const rows = [...ids].sort();
  let state = SEED;
  for (let index = rows.length - 1; index > 0; index -= 1) {
    state = mix(state);
    const swap = state % (index + 1);
    const current = rows[index];
    rows[index] = rows[swap]!;
    rows[swap] = current!;
  }
  return { tune: rows.slice(0, TUNE_COUNT), holdout: rows.slice(TUNE_COUNT) };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function recall(expected: string[], got: string[], match: (label: string, value: string) => boolean) {
  const labelled = expected.map((value) => value.trim()).filter(Boolean);
  if (labelled.length === 0) return { hit: 0, total: 0 };
  const hit = labelled.filter((label) => got.some((value) => match(label, value))).length;
  return { hit, total: labelled.length };
}

async function main() {
  const which = process.argv[2] === "holdout" ? "holdout" : "tune";
  loadEnvFile();
  if (process.env.NODE_ENV === "production") {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
  }
  const dir = path.join(process.cwd(), ".data/resumes/indian_resumes/hireiq_fixtures");
  const ids = readdirSync(dir)
    .filter((name) => name.startsWith("dataturks-") && name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
  const split = dataturksSplit(ids);
  if (split.tune.length !== 179 || split.holdout.length !== 40) {
    throw new Error(`split ${split.tune.length}/${split.holdout.length}`);
  }
  writeFileSync(
    path.join(process.cwd(), ".data/resumes/dataturks-fixture-split.json"),
    JSON.stringify({ seed: SEED, tune: split.tune, holdout: split.holdout }, null, 2),
  );
  const chosen = which === "holdout" ? split.holdout : split.tune;
  const fixtures = chosen.map((id) => JSON.parse(readFileSync(path.join(dir, `${id}.json`), "utf8")) as Fixture);
  const corrections = loadCorrections();
  const totals = { titles: [0, 0], companies: [0, 0], degrees: [0, 0], skills: [0, 0] };
  const correctedTotals = { titles: [0, 0], companies: [0, 0] };
  let predicted = 0;
  let predictedHit = 0;
  let verified = 0;
  let model = 0;
  let unreviewed = 0;
  let timeouts = 0;
  const passTimes = { fieldsMs: [] as number[], skillsMs: [] as number[], rolesMs: [] as number[], wallMs: [] as number[] };
  let rolesSkipped = 0;
  const companyMisses: string[] = [];
  await mapPool(fixtures, 4, async (row) => {
    const proposal = await proposeResumeFieldsDetailed(row.text, { optedOut: false, subject: { synthetic: true } });
    if (proposal.modelFailure === "TIMEOUT") timeouts += 1;
    if (proposal.timings) {
      passTimes.fieldsMs.push(proposal.timings.fieldsMs);
      passTimes.skillsMs.push(proposal.timings.skillsMs);
      passTimes.rolesMs.push(proposal.timings.rolesMs);
      passTimes.wallMs.push(proposal.timings.wallMs);
      if (proposal.timings.rolesSkipped) rolesSkipped += 1;
    }
    if (proposal.source === "model") model += 1;
    else unreviewed += 1;
    const gotTitles = proposal.fields.experience.map((role) => role.title.value);
    const gotCompanies = proposal.fields.experience.flatMap((role) => (role.organization ? [role.organization.value] : []));
    const gotDegrees = proposal.fields.education.map((school) => school.credential.value);
    const gotSkills = [
      ...proposal.fields.skills,
      ...proposal.fields.otherMentions,
    ].filter((skill) => verifiedSkill(skill.value, skill.quote, row.text));
    const primarySkills = proposal.fields.skills.filter((skill) => verifiedSkill(skill.value, skill.quote, row.text));
    const title = recall(row.titles, gotTitles, labelsMatch);
    const company = recall(row.companies, gotCompanies, employersNearMatch);
    const degree = recall(row.credentials, gotDegrees, labelsMatch);
    const gold = [...new Set(row.skills.flatMap(skillLabelTokens))];
    const skill = recall(gold, gotSkills.map((skill) => skill.value), skillsMatch);
    const fixed = correctedFixture(row, corrections);
    const titleFixed = recall(fixed.titles, gotTitles, labelsMatch);
    const companyFixed = recall(fixed.companies, gotCompanies, employersNearMatch);
    totals.titles[0] += title.hit;
    totals.titles[1] += title.total;
    totals.companies[0] += company.hit;
    totals.companies[1] += company.total;
    correctedTotals.titles[0] += titleFixed.hit;
    correctedTotals.titles[1] += titleFixed.total;
    correctedTotals.companies[0] += companyFixed.hit;
    correctedTotals.companies[1] += companyFixed.total;
    totals.degrees[0] += degree.hit;
    totals.degrees[1] += degree.total;
    totals.skills[0] += skill.hit;
    totals.skills[1] += skill.total;
    for (const skillValue of primarySkills) {
      predicted += 1;
      if (gold.some((label) => skillsMatch(label, skillValue.value))) predictedHit += 1;
      verified += 1;
    }
    if (which === "tune") {
      for (const label of row.companies) {
        if (gotCompanies.some((value) => employersNearMatch(label, value))) continue;
        if (companyMisses.length < 12) companyMisses.push(`${row.id}: ${label}`);
      }
    }
  });
  const pct = (pair: number[]) => (pair[1] === 0 ? null : Math.round((1000 * pair[0]) / pair[1]) / 10);
  console.log(
    JSON.stringify(
      {
        split: which,
        seed: SEED,
        resumes: fixtures.length,
        model,
        unreviewed,
        titles: pct(totals.titles),
        companies: pct(totals.companies),
        titlesCorrected: pct(correctedTotals.titles),
        companiesCorrected: pct(correctedTotals.companies),
        degrees: pct(totals.degrees),
        skillsRecall: pct(totals.skills),
        skillPrecision: predicted === 0 ? null : Math.round((1000 * predictedHit) / predicted) / 10,
        timeouts,
        rolesSkipped,
        passes: {
          fieldsMs: passTimes.fieldsMs.length === 0 ? 0 : Math.round(passTimes.fieldsMs.reduce((sum, value) => sum + value, 0) / passTimes.fieldsMs.length),
          skillsMs: passTimes.skillsMs.length === 0 ? 0 : Math.round(passTimes.skillsMs.reduce((sum, value) => sum + value, 0) / passTimes.skillsMs.length),
          rolesMs: passTimes.rolesMs.length === 0 ? 0 : Math.round(passTimes.rolesMs.reduce((sum, value) => sum + value, 0) / passTimes.rolesMs.length),
          wallMs: passTimes.wallMs.length === 0 ? 0 : Math.round(passTimes.wallMs.reduce((sum, value) => sum + value, 0) / passTimes.wallMs.length),
          wallP95Ms: (() => {
            const sorted = [...passTimes.wallMs].sort((left, right) => left - right);
            if (sorted.length === 0) return 0;
            const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
            return sorted[index] ?? 0;
          })(),
        },
        verifiedSkillPrecision: predicted === 0 ? null : Math.round((1000 * verified) / predicted) / 10,
        labelled: totals,
        companyMisses: which === "tune" ? companyMisses : undefined,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
