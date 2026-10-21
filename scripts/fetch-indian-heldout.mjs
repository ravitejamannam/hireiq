/**
 * Pull 30 Indian text PDFs that are not in the frozen fresh sets.
 * Text is extracted with pdf-parse only. The field model does not run.
 *
 *   node scripts/fetch-indian-heldout.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const WANT = 30;
const root = path.join(process.cwd(), ".data/resumes");
const outDir = path.join(root, "indian-independent");

const STRONG_INDIAN = [
  /\bb\.?\s*tech\b/i,
  /\bbachelor of technology\b/i,
  /\bm\.?\s*tech\b/i,
  /\bmaster of technology\b/i,
  /\bbachelor of engineering\b/i,
  /\bb\.e\./i,
  /\bbangalore\b/i,
  /\bbengaluru\b/i,
  /\bhyderabad\b/i,
  /\bpune\b/i,
  /\bmumbai\b/i,
  /\bchennai\b/i,
  /\bnoida\b/i,
  /\bgurgaon\b/i,
  /\bgurugram\b/i,
  /\bpvt\.?\s*ltd\b/i,
];
function looksIndian(text) {
  return STRONG_INDIAN.some((pattern) => pattern.test(text)) || (/\bindia\b/i.test(text) && INDIAN_STATE.test(text));
}
const INDIAN_STATE = /\b(karnataka|maharashtra|tamil nadu|telangana|andhra pradesh|kerala|gujarat|rajasthan)\b/i;
const VIETNAMESE_CHARS = /[ăâêôơưđàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i;
const NOT_INDIAN = /vietnam|viet nam|hanoi|ha noi|ho chi minh|sai gon|saigon|da nang|công ty|kinh nghiệm/i;

async function takenNames() {
  const names = new Set();
  for (const dir of ["fresh-heldout/pdf", "fresh-tune/pdf", "indian-independent/pdf"]) {
    try {
      for (const name of await readdir(path.join(root, dir))) names.add(name.toLowerCase());
    } catch {
      // That pack is not on disk.
    }
  }
  return names;
}

async function listing(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Listing failed ${response.status} ${url}`);
  return response.json();
}

async function pdfText(file) {
  const { PDFParse } = await import("pdf-parse");
  const bytes = await readFile(file);
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text ?? "";
}

async function main() {
  const taken = await takenNames();
  const rows = await listing("https://huggingface.co/api/datasets/d4rk3r/resumes-raw-pdf/tree/main/all-domains");
  const pool = rows
    .filter((entry) => String(entry.path ?? "").toLowerCase().endsWith(".pdf"))
    .map((entry) => ({
      file: path.basename(entry.path),
      url: `https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf/resolve/main/${entry.path}`,
    }))
    .filter((item) => !taken.has(item.file.toLowerCase()));
  const pdfDir = path.join(outDir, "pdf");
  const txtDir = path.join(outDir, "txt");
  await mkdir(pdfDir, { recursive: true });
  await mkdir(txtDir, { recursive: true });
  const kept = [];
  let seen = 0;
  for (const pick of pool) {
    if (kept.length >= WANT) break;
    seen += 1;
    const destination = path.join(pdfDir, pick.file);
    const response = await fetch(pick.url);
    if (!response.ok || !response.body) continue;
    await pipeline(response.body, createWriteStream(destination));
    const text = await pdfText(destination);
    const words = text.split(/\s+/).filter(Boolean).length;
    const indian = looksIndian(text) && !NOT_INDIAN.test(text) && !VIETNAMESE_CHARS.test(text) && words >= 120;
    if (!indian) {
      const { unlink } = await import("node:fs/promises");
      await unlink(destination);
      continue;
    }
    await writeFile(path.join(txtDir, pick.file.replace(/\.pdf$/, ".txt")), text);
    kept.push(pick);
    console.log(`kept ${kept.length} ${pick.file} words=${words}`);
  }
  if (kept.length < WANT) throw new Error(`Only ${kept.length} Indian text PDFs after ${seen} downloads`);
  const sheet = ["id,file,source,titles,companies,degrees,skills,verified,draft"];
  kept.forEach((pick, index) => {
    const id = `india-${String(index + 1).padStart(2, "0")}`;
    sheet.push([id, pick.file, "https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf", "", "", "", "", "false", ""].join(","));
  });
  await writeFile(path.join(outDir, "labels.csv"), `${sheet.join("\n")}\n`);
  console.log(`indian-independent ${kept.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
