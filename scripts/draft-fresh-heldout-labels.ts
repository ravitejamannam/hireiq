/**
 * Fill fresh-heldout/labels.csv from the model. Every row stays unverified.
 * Do not score against this sheet until a person sets verified to true.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { extractResumeText } from "@/lib/resumes/text-extraction";

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

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseRow(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

async function main() {
  loadEnvFile();
  const dir = path.join(process.cwd(), ".data/resumes/fresh-heldout");
  const raw = readFileSync(path.join(dir, "labels.csv"), "utf8").trim().split("\n");
  const header = parseRow(raw[0] ?? "");
  const idAt = header.indexOf("id");
  const fileAt = header.indexOf("file");
  const sourceAt = header.indexOf("source");
  const rows = raw.slice(1).filter(Boolean).map(parseRow);
  const out = ["id,file,source,titles,companies,degrees,skills,verified,draft"];
  for (const row of rows) {
    const id = row[idAt] ?? "";
    const file = row[fileAt] ?? "";
    const source = row[sourceAt] ?? "";
    const bytes = readFileSync(path.join(dir, "pdf", file));
    const extracted = await extractResumeText(Buffer.from(bytes), { fileName: file, contentType: "application/pdf" });
    const proposal = extracted.ok ? await proposeResumeFieldsDetailed(extracted.text) : null;
    const fields = proposal?.source === "model" ? proposal.fields : null;
    const titles = fields?.experience.map((role) => role.title.value).join("|") ?? "";
    const companies = fields?.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])).join("|") ?? "";
    const degrees = fields?.education.map((school) => school.credential.value).join("|") ?? "";
    const skills = fields?.skills.map((skill) => skill.value).join("|") ?? "";
    out.push([id, file, source, titles, companies, degrees, skills, "false", "model"].map(csvCell).join(","));
    console.log(JSON.stringify({ id, model: proposal?.source === "model", titles: titles.split("|").filter(Boolean).length }));
  }
  writeFileSync(path.join(dir, "labels.csv"), `${out.join("\n")}\n`);
  console.log(`draft labels ${rows.length} unverified`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
