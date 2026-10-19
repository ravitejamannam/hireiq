/**
 * Audit the 15 unseen PDFs: skill quotes, company misses, model fallback reasons.
 * Does not change labels.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { extractResumeText } from "@/lib/resumes/text-extraction";

type Label = { id: string; titles: string[]; companies: string[]; degrees: string[]; skills: string[] };

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

function snippet(source: string, needle: string) {
  const at = source.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - 80);
  const end = Math.min(source.length, at + needle.length + 80);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

async function main() {
  loadEnvFile();
  const root = path.join(process.cwd(), ".data/resumes");
  const labels = JSON.parse(readFileSync(path.join(root, "indian-heldout-remaining.json"), "utf8")) as {
    resumes: Label[];
  };
  const skills: Array<Record<string, unknown>> = [];
  const companies: Array<Record<string, unknown>> = [];
  const fallbacks: Array<Record<string, unknown>> = [];
  for (const row of labels.resumes) {
    const bytes = readFileSync(path.join(root, "indian_resumes/pdf", `${row.id}.pdf`));
    const extracted = await extractResumeText(Buffer.from(bytes), {
      fileName: `${row.id}.pdf`,
      contentType: "application/pdf",
    });
    if (!extracted.ok) {
      fallbacks.push({ id: row.id, modelFailure: "PDF_TEXT_FAILED" });
      continue;
    }
    const proposal = await proposeResumeFieldsDetailed(extracted.text);
    if (proposal.source !== "model") {
      fallbacks.push({ id: row.id, modelFailure: proposal.modelFailure, chars: extracted.text.length });
    }
    for (const skill of proposal.fields.skills) {
      skills.push({
        id: row.id,
        source: proposal.source,
        value: skill.value,
        quote: skill.quote,
        quoteInText: extracted.text.includes(skill.quote),
      });
    }
    const got = proposal.fields.experience.flatMap((role) => (role.organization ? [role.organization.value] : []));
    for (const company of row.companies) {
      if (got.some((value) => labelsMatch(company, value))) continue;
      companies.push({
        id: row.id,
        source: proposal.source,
        company,
        snippet: snippet(extracted.text, company),
        got,
      });
    }
  }
  const out = { skillCount: skills.length, misses: companies.length, fallbacks, companies, skills };
  writeFileSync(path.join(root, "heldout-15-audit.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ skills: skills.length, misses: companies.length, fallbacks }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
