/**
 * Score the production resume path on the frozen Indian PDF labels.
 * Path: PDF text, then LLM full-schema extraction, quote check, heuristic only if that fails.
 * Labels are read-only. This script does not change them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { listenForExtractionUsage, type ExtractionUsage } from "@/lib/resumes/extraction-meter";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";
import { extractResumeText } from "@/lib/resumes/text-extraction";

type Label = {
  id: string;
  titles: string[];
  companies: string[];
  degrees: string[];
  skills: string[];
};

/** Published gpt-4o-mini rates, USD per token. Input includes image tokens. */
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
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

async function main() {
  loadEnvFile();
  const root = path.join(process.cwd(), ".data/resumes");
  const labelName = process.argv[2] ?? "indian-heldout-labels.json";
  const labels = JSON.parse(readFileSync(path.join(root, labelName), "utf8")) as {
    seed?: number;
    resumes: Label[];
  };
  const totals = { titles: [0, 0], companies: [0, 0], degrees: [0, 0], skills: [0, 0] };
  const skillCounts = { truePositive: 0, predicted: 0, gold: 0 };
  const usage = new Map<string, { promptTokens: number; completionTokens: number }>();
  const stop = listenForExtractionUsage((event: ExtractionUsage) => {
    const bucket = usage.get(event.model) ?? { promptTokens: 0, completionTokens: 0 };
    bucket.promptTokens += event.promptTokens;
    bucket.completionTokens += event.completionTokens;
    usage.set(event.model, bucket);
  });
  let failed = 0;
  let modelCount = 0;
  let heuristicCount = 0;
  const times: number[] = [];
  try {
    const rows = await mapPool(labels.resumes, 4, async (row) => {
      const bytes = readFileSync(path.join(root, "indian_resumes/pdf", `${row.id}.pdf`));
      const started = performance.now();
      const extracted = await extractResumeText(Buffer.from(bytes), {
        fileName: `${row.id}.pdf`,
        contentType: "application/pdf",
      });
      const proposal = extracted.ok ? await proposeResumeFieldsDetailed(extracted.text) : null;
      const elapsed = performance.now() - started;
      return { row, extractedOk: extracted.ok, proposal, elapsed };
    });
    for (const item of rows) {
      times.push(item.elapsed);
      if (!item.extractedOk || !item.proposal) {
        failed += 1;
        continue;
      }
      if (item.proposal.source === "model") modelCount += 1;
      else heuristicCount += 1;
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
      const goldSet = new Set(gold);
      const hits = predicted.filter((skill) => goldSet.has(skill)).length;
      skillCounts.truePositive += hits;
      skillCounts.predicted += predicted.length;
      skillCounts.gold += gold.length;
      if (gold.length > 0) {
        totals.skills[0] += hits;
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
  const resumes = labels.resumes.length;
  console.log(
    JSON.stringify(
      {
        seed: labels.seed ?? null,
        path: "proposeResumeFields",
        resumes,
        pdfFailures: failed,
        modelAccepted: modelCount,
        heuristicFallback: heuristicCount,
        titles: pct(totals.titles),
        companies: pct(totals.companies),
        degrees: pct(totals.degrees),
        skillsRecall: pct(totals.skills),
        skillPrecision:
          skillCounts.predicted === 0
            ? null
            : Math.round((1000 * skillCounts.truePositive) / skillCounts.predicted) / 10,
        skillCounts,
        labelled: totals,
        costUsd: pricedTokens ? Math.round(usd * 1_000_000) / 1_000_000 : null,
        costPerResumeUsd: pricedTokens ? Math.round((usd / resumes) * 1_000_000) / 1_000_000 : null,
        pricePerMillionTokensUsd: { input: 0.15, output: 0.6, model: "gpt-4o-mini" },
        models,
        p50ms: Math.round(percentile(times, 0.5)),
        p95ms: Math.round(percentile(times, 0.95)),
        meanMs: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length),
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
