/**
 * Score the production resume path on the DataTurks train split only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";

type Row = {
  content: string;
  annotation?: Array<{ label?: string[]; points?: Array<{ text?: string }> }>;
};

function loadEnvFile() {
  const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function spans(row: Row, label: string) {
  const values: string[] = [];
  for (const annotation of row.annotation ?? []) {
    if (!(annotation.label ?? []).includes(label)) continue;
    for (const point of annotation.points ?? []) {
      const text = String(point.text ?? "").trim();
      if (text) values.push(text);
    }
  }
  return values;
}

/** "Languages: Core Java" is the skill Core Java. The heading is not part of the name. */
export function stripSkillLabelPrefix(value: string) {
  return value.replace(/^(?:[A-Za-z][A-Za-z0-9 &/+-]{0,40}):\s*/, "").trim();
}

function skillTokens(row: Row) {
  const tokens: string[] = [];
  for (const span of spans(row, "Skills")) {
    for (const part of span.split(/[,|\n•]/)) {
      const token = stripSkillLabelPrefix(part.trim());
      if (token.length >= 3 && token.length <= 40 && row.content.includes(token)) tokens.push(token);
    }
  }
  return tokens;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function main() {
  loadEnvFile();
  const file = path.join(process.cwd(), ".data/resumes/dataturks-traindata.json");
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Row);
  const totals = { titles: [0, 0], companies: [0, 0], degrees: [0, 0], skills: [0, 0] };
  let model = 0;
  let heuristic = 0;
  let skillPredicted = 0;
  let skillHit = 0;
  await mapPool(rows, 4, async (row) => {
    const proposal = await proposeResumeFieldsDetailed(row.content);
    if (proposal.source === "model") model += 1;
    else heuristic += 1;
    const got = {
      titles: proposal.fields.experience.map((role) => role.title.value),
      companies: proposal.fields.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])),
      degrees: proposal.fields.education.map((school) => school.credential.value),
      skills: proposal.fields.skills.map((skill) => skill.value),
    };
    const expected = {
      titles: spans(row, "Designation").filter((label) => row.content.includes(label)),
      companies: spans(row, "Companies worked at").filter((label) => row.content.includes(label)),
      degrees: spans(row, "Degree").filter((label) => row.content.includes(label)),
    };
    for (const field of ["titles", "companies", "degrees"] as const) {
      for (const label of expected[field]) {
        totals[field][1] += 1;
        if (got[field].some((value) => labelsMatch(label, value))) totals[field][0] += 1;
      }
    }
    const gold = [...new Set(skillTokens(row).map((token) => canonicalSkill(token).trim().toLowerCase()))];
    const predicted = [...new Set(got.skills.map((skill) => canonicalSkill(skill).trim().toLowerCase()))];
    const goldSet = new Set(gold);
    for (const skill of predicted) {
      skillPredicted += 1;
      if (goldSet.has(skill)) skillHit += 1;
    }
    for (const skill of gold) {
      totals.skills[1] += 1;
      if (predicted.includes(skill)) totals.skills[0] += 1;
    }
  });
  const pct = (pair: number[]) => (pair[1] === 0 ? null : Math.round((1000 * pair[0]) / pair[1]) / 10);
  console.log(
    JSON.stringify(
      {
        split: "dataturks-train",
        resumes: rows.length,
        model,
        unreviewed: heuristic,
        titles: pct(totals.titles),
        companies: pct(totals.companies),
        degrees: pct(totals.degrees),
        skillsRecall: pct(totals.skills),
        skillPrecision: skillPredicted === 0 ? null : Math.round((1000 * skillHit) / skillPredicted) / 10,
        labelled: totals,
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
