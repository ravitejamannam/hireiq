/**
 * Convert DataTurks JSONL into local labelled fixtures and redact them.
 * Reads .data/resumes/dataturks-*.json and writes .data/resumes/dataturks.
 * Those files stay gitignored. Do not commit them.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { redactResumeFixture } from "@/lib/resumes/extraction-quality";

const root = path.join(process.cwd(), ".data/resumes");
const outDir = path.join(root, "dataturks");

function unique(values: string[]) {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const value of values) {
    const text = value.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    rows.push(text);
  }
  return rows;
}

function spans(annotation: Array<{ label?: string[]; points?: Array<{ text?: string }> }>, label: string) {
  return annotation.flatMap((item) => {
    if (!(item.label ?? []).includes(label)) return [];
    return (item.points ?? []).map((point) => String(point.text ?? ""));
  });
}

async function linesFrom(file: string) {
  const raw = await readFile(path.join(root, file), "utf8");
  return raw.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const lines = [
    ...(await linesFrom("dataturks-traindata.json")),
    ...(await linesFrom("dataturks-testdata.json")),
  ];
  let written = 0;
  for (const line of lines) {
    const row = JSON.parse(line) as {
      content?: string;
      annotation?: Array<{ label?: string[]; points?: Array<{ text?: string }> }>;
    };
    if (!row.content?.trim()) continue;
    written += 1;
    const skills = spans(row.annotation ?? [], "Skills").flatMap((text) => text.split(/[,;/]/));
    const fixture = {
      id: `dataturks-${String(written).padStart(3, "0")}`,
      text: redactResumeFixture(row.content),
      titles: unique(spans(row.annotation ?? [], "Designation")),
      companies: unique(spans(row.annotation ?? [], "Companies worked at")),
      skills: unique(skills),
      credentials: unique(spans(row.annotation ?? [], "Degree")),
      projects: [] as string[],
    };
    await writeFile(path.join(outDir, `${fixture.id}.json`), `${JSON.stringify(fixture)}\n`);
  }
  const names = (await readdir(outDir)).filter((name) => name.endsWith(".json"));
  console.log(`wrote ${names.length} redacted fixtures to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
