/**
 * Draft labels for the Indian held-out with gpt-4o.
 * The parser uses gpt-4o-mini. This script does not call it.
 * Labels are frozen once this file is written. Do not edit them to match parser output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LABEL_MODEL = "gpt-4o";

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
    if (key === "OPENAI_API_KEY" || !process.env[key]) process.env[key] = value;
  }
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

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function asList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

async function labelOne(text: string, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LABEL_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Label this resume. Return JSON with keys titles, companies, degrees, skills. Each is an array of strings copied from the resume. Titles are jobs held, not the job being applied for. Companies are employers, not clients or schools. Degrees are credentials, not the school name. Skills are tools and methods, not traits or duties. Leave an array empty when the resume does not state that field.",
        },
        { role: "user", content: text.slice(0, 12_000) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`label status ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  return {
    titles: asList(parsed.titles),
    companies: asList(parsed.companies),
    degrees: asList(parsed.degrees),
    skills: asList(parsed.skills),
  };
}

async function main() {
  loadEnvFile();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const dir = path.join(process.cwd(), ".data/resumes/indian-independent");
  const table = parseCsv(readFileSync(path.join(dir, "labels.csv"), "utf8"));
  const header = ["id", "file", "source", "titles", "companies", "degrees", "skills", "verified", "draft"];
  const lines = [header.join(",")];
  for (const row of table) {
    const text = readFileSync(path.join(dir, "txt", (row.file ?? "").replace(/\.pdf$/, ".txt")), "utf8");
    const labels = await labelOne(text, apiKey);
    lines.push(
      [row.id, row.file, row.source, labels.titles.join("|"), labels.companies.join("|"), labels.degrees.join("|"), labels.skills.join("|"), "true", LABEL_MODEL]
        .map((value) => csvCell(value ?? ""))
        .join(","),
    );
    console.log(`labeled ${row.id} titles=${labels.titles.length} skills=${labels.skills.length}`);
  }
  writeFileSync(path.join(dir, "labels.csv"), `${lines.join("\n")}\n`);
  console.log(`froze ${table.length} labels from ${LABEL_MODEL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
