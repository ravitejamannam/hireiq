/**
 * Score the frozen production parser on fresh-heldout rows with verified=true.
 * Unverified scans are excluded. This script does not change the labels.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { listenForExtractionUsage, type ExtractionUsage } from "@/lib/resumes/extraction-meter";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";
import { skillsMatch } from "@/lib/resumes/fixture-score";
import { extractResumeText } from "@/lib/resumes/text-extraction";

type Label = {
  id: string;
  file: string;
  titles: string[];
  companies: string[];
  degrees: string[];
  skills: string[];
};

const MINI_INPUT_USD = 0.15 / 1_000_000;
const MINI_OUTPUT_USD = 0.6 / 1_000_000;

function loadEnvFile() {
  const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "OPENAI_API_KEY" || !process.env[key]) process.env[key] = value;
  }
}

function splitField(value: string) {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldRecall(expected: string[], got: string[]) {
  if (expected.length === 0) return null;
  const found = expected.filter((label) => got.some((value) => labelsMatch(label, value))).length;
  return found / expected.length;
}

function skillKey(value: string) {
  return canonicalSkill(value).trim().toLowerCase();
}

function uniqueSkills(values: string[]) {
  return [...new Set(values.map(skillKey).filter(Boolean))];
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((line) => line.some((value) => value.trim()))
    .map((line) => Object.fromEntries(header.map((name, index) => [name, line[index] ?? ""])));
}

async function main() {
  loadEnvFile();
  if (process.env.NODE_ENV === "production") {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
  }
  const setName = process.argv[2] ?? "fresh-heldout";
  const dir = path.join(process.cwd(), ".data/resumes", setName);
  const table = parseCsv(readFileSync(path.join(dir, "labels.csv"), "utf8"));
  const resumes: Label[] = table
    .filter((row) => row.verified === "true")
    .map((row) => ({
      id: row.id ?? "",
      file: row.file ?? "",
      titles: splitField(row.titles ?? ""),
      companies: splitField(row.companies ?? ""),
      degrees: splitField(row.degrees ?? ""),
      skills: splitField(row.skills ?? ""),
    }));
  const totals = { titles: [0, 0], companies: [0, 0], degrees: [0, 0], skills: [0, 0] };
  const skillCounts = { truePositive: 0, predicted: 0, gold: 0, normalisedTruePositive: 0, normalisedPredicted: 0 };
  const usage = new Map<string, { promptTokens: number; completionTokens: number }>();
  const stop = listenForExtractionUsage((event: ExtractionUsage) => {
    const bucket = usage.get(event.model) ?? { promptTokens: 0, completionTokens: 0 };
    bucket.promptTokens += event.promptTokens;
    bucket.completionTokens += event.completionTokens;
    usage.set(event.model, bucket);
  });
  let failed = 0;
  let modelCount = 0;
  let unreviewedCount = 0;
  const failures: Record<string, number> = {};
  const times: number[] = [];
  const passTimes = { fieldsMs: [] as number[], skillsMs: [] as number[], rolesMs: [] as number[], wallMs: [] as number[] };
  let rolesSkipped = 0;
  let timeouts = 0;
  try {
    const rows = await mapPool(resumes, 3, async (row) => {
      const started = performance.now();
      try {
        const bytes = readFileSync(path.join(dir, "pdf", row.file));
        const extracted = await extractResumeText(Buffer.from(bytes), {
          fileName: row.file,
          contentType: "application/pdf",
        });
        const proposal = extracted.ok
          ? await proposeResumeFieldsDetailed(extracted.text, { optedOut: false, subject: { synthetic: true } })
          : null;
        return { row, extractedOk: extracted.ok, proposal, elapsed: performance.now() - started, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${row.id} failed: ${message}`);
        return { row, extractedOk: false, proposal: null, elapsed: performance.now() - started, error: message };
      }
    });
    for (const item of rows) {
      times.push(item.elapsed);
      if (item.proposal?.modelFailure === "TIMEOUT") timeouts += 1;
      if (item.proposal?.timings) {
        passTimes.fieldsMs.push(item.proposal.timings.fieldsMs);
        passTimes.skillsMs.push(item.proposal.timings.skillsMs);
        passTimes.rolesMs.push(item.proposal.timings.rolesMs);
        passTimes.wallMs.push(item.proposal.timings.wallMs);
        if (item.proposal.timings.rolesSkipped) rolesSkipped += 1;
      }
      if (!item.extractedOk || !item.proposal) {
        failed += 1;
        continue;
      }
      if (item.proposal.source === "model") modelCount += 1;
      else {
        unreviewedCount += 1;
        const reason = item.proposal.modelFailure ?? "unknown";
        failures[reason] = (failures[reason] ?? 0) + 1;
      }
      const fields = item.proposal.fields;
      const got = {
        titles: fields.experience.map((role) => role.title.value),
        companies: fields.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])),
        degrees: fields.education.map((school) => school.credential.value),
        skills: fields.skills.map((skill) => skill.value),
      };
      const title = fieldRecall(item.row.titles, got.titles);
      const company = fieldRecall(item.row.companies, got.companies);
      const degree = fieldRecall(item.row.degrees, got.degrees);
      if (title !== null) {
        totals.titles[0] += title * item.row.titles.length;
        totals.titles[1] += item.row.titles.length;
      }
      if (company !== null) {
        totals.companies[0] += company * item.row.companies.length;
        totals.companies[1] += item.row.companies.length;
      }
      if (degree !== null) {
        totals.degrees[0] += degree * item.row.degrees.length;
        totals.degrees[1] += item.row.degrees.length;
      }
      const gold = uniqueSkills(item.row.skills);
      const predicted = uniqueSkills(got.skills);
      const recalled = uniqueSkills([...got.skills, ...fields.otherMentions.map((skill) => skill.value)]);
      const goldSet = new Set(gold);
      const exactHits = predicted.filter((skill) => goldSet.has(skill)).length;
      const recallHits = recalled.filter((skill) => goldSet.has(skill)).length;
      const normalisedHits = got.skills.filter((skill) => item.row.skills.some((label) => skillsMatch(label, skill))).length;
      skillCounts.truePositive += exactHits;
      skillCounts.predicted += predicted.length;
      skillCounts.gold += gold.length;
      skillCounts.normalisedTruePositive += normalisedHits;
      skillCounts.normalisedPredicted += got.skills.length;
      if (gold.length > 0) {
        totals.skills[0] += recallHits;
        totals.skills[1] += gold.length;
      }
    }
  } finally {
    stop();
  }
  times.sort((left, right) => left - right);
  const pct = (pair: number[]) => (pair[1] === 0 ? null : Math.round((1000 * pair[0]) / pair[1]) / 10);
  let usd = 0;
  let pricedTokens = true;
  const models: Record<string, { promptTokens: number; completionTokens: number; usd: number | null }> = {};
  for (const [model, bucket] of usage) {
    const mini = model.includes("gpt-4o-mini");
    const modelUsd = mini ? bucket.promptTokens * MINI_INPUT_USD + bucket.completionTokens * MINI_OUTPUT_USD : null;
    if (modelUsd === null) pricedTokens = false;
    else usd += modelUsd;
    models[model] = { ...bucket, usd: modelUsd === null ? null : Math.round(modelUsd * 1_000_000) / 1_000_000 };
  }
  console.log(
    JSON.stringify(
      {
        set: setName,
        seed: 20261021,
        verifiedOnly: true,
        resumes: resumes.length,
        excludedUnverified: table.length - resumes.length,
        pdfFailures: failed,
        modelAccepted: modelCount,
        unreviewed: unreviewedCount,
        failures,
        titles: pct(totals.titles),
        companies: pct(totals.companies),
        degrees: pct(totals.degrees),
        skillsRecall: pct(totals.skills),
        skillsRecallPrimaryPlusOther: pct(totals.skills),
        skillPrecision:
          skillCounts.predicted === 0
            ? null
            : Math.round((1000 * skillCounts.truePositive) / skillCounts.predicted) / 10,
        skillPrecisionNormalised:
          skillCounts.normalisedPredicted === 0
            ? null
            : Math.round((1000 * skillCounts.normalisedTruePositive) / skillCounts.normalisedPredicted) / 10,
        skillCounts,
        labelled: totals,
        costUsd: pricedTokens ? Math.round(usd * 1_000_000) / 1_000_000 : null,
        costPerResumeUsd: pricedTokens && resumes.length > 0 ? Math.round((usd / resumes.length) * 1_000_000) / 1_000_000 : null,
        p50ms: Math.round(percentile(times, 0.5)),
        p95ms: Math.round(percentile(times, 0.95)),
        timeouts,
        rolesSkipped,
        passes: {
          fieldsMs: Math.round(mean(passTimes.fieldsMs)),
          skillsMs: Math.round(mean(passTimes.skillsMs)),
          rolesMs: Math.round(mean(passTimes.rolesMs)),
          wallMs: Math.round(mean(passTimes.wallMs)),
          sequentialMs: Math.round(mean(passTimes.fieldsMs.map((value, index) => value + (passTimes.skillsMs[index] ?? 0) + (passTimes.rolesMs[index] ?? 0)))),
        },
        primarySkillsPerResume: resumes.length === 0 ? 0 : Math.round((10 * skillCounts.predicted) / resumes.length) / 10,
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
