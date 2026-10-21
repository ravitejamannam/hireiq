/**
 * Copy 30 Indian text PDFs from the local corpus into indian-independent.
 * pdf-parse only. Does not run the field model.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WANT = 30;
const SEED = 20261023;
const sourceDir = path.join(process.cwd(), ".data/resumes/annotated-ner/pdf/ResumesPDF");
const outDir = path.join(process.cwd(), ".data/resumes/indian-independent");
const STRONG_INDIAN = [
  /\bb\.?\s*tech\b/i,
  /\bbachelor of technology\b/i,
  /\bm\.?\s*tech\b/i,
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
const NOT_INDIAN = /vietnam|viet nam|hanoi|ha noi|ho chi minh|sai gon|saigon/i;
const VIETNAMESE_CHARS = /[ăâêôơưđàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i;

function mix(state) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
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
  const names = (await readdir(sourceDir)).filter((name) => name.toLowerCase().endsWith(".pdf"));
  let state = SEED;
  for (let index = names.length - 1; index > 0; index -= 1) {
    state = mix(state);
    const swap = state % (index + 1);
    const current = names[index];
    names[index] = names[swap];
    names[swap] = current;
  }
  const pdfDir = path.join(outDir, "pdf");
  const txtDir = path.join(outDir, "txt");
  await mkdir(pdfDir, { recursive: true });
  await mkdir(txtDir, { recursive: true });
  const kept = [];
  for (const name of names) {
    if (kept.length >= WANT) break;
    let text = "";
    try {
      text = await pdfText(path.join(sourceDir, name));
    } catch {
      continue;
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const indian = STRONG_INDIAN.some((pattern) => pattern.test(text)) && !NOT_INDIAN.test(text) && !VIETNAMESE_CHARS.test(text) && words >= 120 && words <= 2500;
    if (!indian) continue;
    const file = `local-${String(kept.length + 1).padStart(2, "0")}.pdf`;
    await copyFile(path.join(sourceDir, name), path.join(pdfDir, file));
    await writeFile(path.join(txtDir, file.replace(/\.pdf$/, ".txt")), text);
    kept.push({ file, sourceName: name, words });
    console.log(`kept ${kept.length} ${name} words=${words}`);
  }
  if (kept.length < WANT) throw new Error(`Only ${kept.length} Indian text PDFs`);
  const sheet = ["id,file,source,titles,companies,degrees,skills,verified,draft"];
  kept.forEach((pick, index) => {
    const id = `india-${String(index + 1).padStart(2, "0")}`;
    sheet.push([id, pick.file, "local-annotated-ner", "", "", "", "", "false", ""].join(","));
  });
  await writeFile(path.join(outDir, "labels.csv"), `${sheet.join("\n")}\n`);
  console.log(`indian-independent ${kept.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
