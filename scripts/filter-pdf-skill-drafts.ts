/**
 * Re-apply the production skill filter to pdf-skill-relabel.csv.
 * Leaves every row unverified.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isResumeSkillPhrase } from "@/lib/resumes/skill-phrase";

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

const file = path.join(process.cwd(), ".data/resumes/pdf-skill-relabel.csv");
const raw = readFileSync(file, "utf8").trim().split("\n");
const lines = [raw[0] ?? "id,file,skills,verified,draft"];
let before = 0;
let after = 0;
for (const line of raw.slice(1)) {
  const cells = parseRow(line);
  const skills = (cells[2] ?? "").split("|").map((skill) => skill.trim()).filter(Boolean);
  before += skills.length;
  const kept = skills.filter(isResumeSkillPhrase);
  after += kept.length;
  cells[2] = kept.join("|");
  cells[3] = "false";
  cells[4] = "model";
  lines.push(cells.map(csvCell).join(","));
}
writeFileSync(file, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ before, after, verified: false }));
