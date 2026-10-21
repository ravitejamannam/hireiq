/**
 * Run the production inline OCR path on the 12 fresh PDFs that have no text layer.
 * They stay out of the text score. This does not edit labels.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractResumeText } from "@/lib/resumes/text-extraction";

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

async function main() {
  loadEnvFile();
  const dir = path.join(process.cwd(), ".data/resumes/fresh-heldout");
  const table = parseCsv(readFileSync(path.join(dir, "labels.csv"), "utf8"));
  const scans = table.filter((row) => row.verified !== "true");
  const outDir = path.join(dir, "ocr");
  mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const row of scans) {
    const bytes = readFileSync(path.join(dir, "pdf", row.file ?? ""));
    const started = performance.now();
    const extracted = await extractResumeText(Buffer.from(bytes), {
      fileName: row.file,
      contentType: "application/pdf",
      ocr: "inline",
    });
    const text = extracted.ok ? extracted.text : "";
    const words = text.split(/\s+/).filter(Boolean).length;
    if (extracted.ok) writeFileSync(path.join(outDir, `${row.id}.txt`), text);
    results.push({
      id: row.id,
      ok: extracted.ok,
      extractor: extracted.ok ? extracted.extractor : extracted.errorCode,
      words,
      ms: Math.round(performance.now() - started),
    });
    console.log(JSON.stringify(results[results.length - 1]));
  }
  const recovered = results.filter((row) => row.words >= 40).length;
  console.log(JSON.stringify({ scans: results.length, recovered, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
