/**
 * Diagnostic dump of fresh-heldout misses. Does not change labels or the parser.
 * Output stays under .data and is not a rescore.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";
import { extractResumeText } from "@/lib/resumes/text-extraction";

type Label = {
  id: string;
  file: string;
  titles: string[];
  companies: string[];
  degrees: string[];
  skills: string[];
};

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

function skillKey(value: string) {
  return canonicalSkill(value).trim().toLowerCase();
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

function missed(expected: string[], got: string[]) {
  return expected.filter((label) => !got.some((value) => labelsMatch(label, value)));
}

async function main() {
  loadEnvFile();
  if (process.env.NODE_ENV === "production") {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
  }
  const dir = path.join(process.cwd(), ".data/resumes/fresh-heldout");
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
  const rows = await mapPool(resumes, 3, async (row) => {
    const bytes = readFileSync(path.join(dir, "pdf", row.file));
    const extracted = await extractResumeText(Buffer.from(bytes), {
      fileName: row.file,
      contentType: "application/pdf",
    });
    const proposal = extracted.ok
      ? await proposeResumeFieldsDetailed(extracted.text, { optedOut: false, subject: { synthetic: true } })
      : null;
    const fields = proposal?.fields;
    const got = {
      titles: fields?.experience.map((role) => role.title.value) ?? [],
      companies: fields?.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])) ?? [],
      degrees: fields?.education.map((school) => school.credential.value) ?? [],
      skills: fields?.skills.map((skill) => skill.value) ?? [],
    };
    const goldSkills = new Set(row.skills.map(skillKey));
    const predictedSkills = [...new Set(got.skills.map(skillKey))];
    return {
      id: row.id,
      failure: proposal?.modelFailure ?? (extracted.ok ? null : "PDF"),
      source: proposal?.source ?? null,
      gold: { titles: row.titles, degrees: row.degrees, skills: row.skills },
      got,
      titleMisses: missed(row.titles, got.titles),
      degreeMisses: missed(row.degrees, got.degrees),
      skillMisses: row.skills.filter((skill) => !goldSkills.has(skillKey(skill)) || !predictedSkills.includes(skillKey(skill))),
      extraSkills: predictedSkills.filter((skill) => !goldSkills.has(skill)),
    };
  });
  const out = path.join(dir, "misses.json");
  mkdirSync(dir, { recursive: true });
  writeFileSync(out, JSON.stringify(rows, null, 2));
  const titleMisses = rows.reduce((sum, row) => sum + row.titleMisses.length, 0);
  const degreeMisses = rows.reduce((sum, row) => sum + row.degreeMisses.length, 0);
  const skillMisses = rows.reduce((sum, row) => sum + row.skillMisses.length, 0);
  const extraSkills = rows.reduce((sum, row) => sum + row.extraSkills.length, 0);
  console.log(JSON.stringify({ resumes: rows.length, titleMisses, degreeMisses, skillMisses, extraSkills, out }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
