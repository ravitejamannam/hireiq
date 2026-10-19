/**
 * Write every title and company miss on the tune split.
 * Does not read the hold-out.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { employersNearMatch } from "@/lib/resumes/fixture-score";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";

function mix(state: number) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

function tuneIds(ids: string[]) {
  const rows = [...ids].sort();
  let state = 20261019;
  for (let index = rows.length - 1; index > 0; index -= 1) {
    state = mix(state);
    const swap = state % (index + 1);
    const current = rows[index];
    rows[index] = rows[swap]!;
    rows[swap] = current!;
  }
  return rows.slice(0, 179);
}

type Fixture = { id: string; text: string; titles: string[]; companies: string[] };

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function snippet(text: string, label: string) {
  const at = text.toLowerCase().indexOf(label.toLowerCase().slice(0, 12));
  if (at < 0) return "";
  return text.slice(Math.max(0, at - 70), at + label.length + 80).replace(/\s+/g, " ").trim();
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

async function main() {
  loadEnvFile();
  const dir = path.join(process.cwd(), ".data/resumes/indian_resumes/hireiq_fixtures");
  const ids = readdirSync(dir)
    .filter((name) => name.startsWith("dataturks-") && name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
  const tune = tuneIds(ids);
  const misses: Array<Record<string, string>> = [];
  await mapPool(tune, 4, async (id) => {
    const row = JSON.parse(readFileSync(path.join(dir, `${id}.json`), "utf8")) as Fixture;
    const proposal = await proposeResumeFieldsDetailed(row.text);
    const titles = proposal.fields.experience.map((role) => role.title.value);
    const companies = proposal.fields.experience.flatMap((role) => (role.organization ? [role.organization.value] : []));
    for (const label of row.titles) {
      if (titles.some((value) => labelsMatch(label, value))) continue;
      misses.push({ id, field: "title", label, got: titles.join(" | "), snippet: snippet(row.text, label) });
    }
    for (const label of row.companies) {
      if (companies.some((value) => employersNearMatch(label, value))) continue;
      misses.push({ id, field: "company", label, got: companies.join(" | "), snippet: snippet(row.text, label) });
    }
  });
  const out = path.join(process.cwd(), ".data/resumes/tune-misses.json");
  writeFileSync(out, JSON.stringify(misses, null, 2));
  console.log(JSON.stringify({ titles: misses.filter((row) => row.field === "title").length, companies: misses.filter((row) => row.field === "company").length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
