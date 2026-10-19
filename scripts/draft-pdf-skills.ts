/**
 * Draft a clean skill list for 15 of the 45 Mehyaar PDFs.
 * Rows stay unverified. Do not score recall against this file until a person sets verified=true.
 *
 *   pnpm exec tsx scripts/draft-pdf-skills.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { verifiedSkill } from "@/lib/resumes/fixture-score";
import { extractResumeText } from "@/lib/resumes/text-extraction";

const SEED = 20261019;

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

function mix(state: number) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main() {
  loadEnvFile();
  const pdfDir = path.join(process.cwd(), ".data/resumes/indian_resumes/pdf");
  const ids = readdirSync(pdfDir).filter((name) => name.endsWith(".pdf")).map((name) => name.replace(/\.pdf$/, "")).sort();
  let state = SEED;
  const order = [...ids];
  for (let index = order.length - 1; index > 0; index -= 1) {
    state = mix(state);
    const swap = state % (index + 1);
    const current = order[index];
    order[index] = order[swap]!;
    order[swap] = current!;
  }
  const picked = order.slice(0, 15);
  const lines = ["id,file,skills,verified,draft"];
  let kept = 0;
  let quoted = 0;
  for (const id of picked) {
    const file = `${id}.pdf`;
    const bytes = readFileSync(path.join(pdfDir, file));
    const extracted = await extractResumeText(Buffer.from(bytes), { fileName: file, contentType: "application/pdf" });
    const proposal = extracted.ok ? await proposeResumeFieldsDetailed(extracted.text) : null;
    const skills = (proposal?.fields.skills ?? []).filter((skill) => extracted.ok && verifiedSkill(skill.value, skill.quote, extracted.text));
    kept += skills.length;
    quoted += skills.length;
    lines.push([id, file, skills.map((skill) => skill.value).join("|"), "false", "model"].map(csvCell).join(","));
    console.log(JSON.stringify({ id, skills: skills.length, model: proposal?.source ?? "none" }));
  }
  const out = path.join(process.cwd(), ".data/resumes/pdf-skill-relabel.csv");
  writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ file: out, resumes: picked.length, skills: kept, quotesInResume: quoted, verified: false }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
