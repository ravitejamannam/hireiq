/**
 * Pull 50 resumes that are not already in .data/resumes, plus a blank labelling sheet.
 * Does not run the parser. Fill the sheet from the PDFs before any score.
 *
 *   node scripts/fetch-fresh-heldout.mjs
 *
 * Files land in .data/resumes/fresh-heldout, which is gitignored.
 * Sources are public Hugging Face datasets for local testing only. Do not commit the PDFs.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const COUNT = 50;
const SEED = 20261021;
const root = path.join(process.cwd(), ".data/resumes");
const outDir = path.join(root, "fresh-heldout");

function mix(state) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

async function existingNames() {
  const names = new Set();
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "fresh-heldout") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else names.add(entry.name.toLowerCase());
    }
  }
  await walk(root);
  return names;
}

async function listing(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Listing failed ${response.status} ${url}`);
  return response.json();
}

async function rawPdfCandidates() {
  const rows = await listing(
    "https://huggingface.co/api/datasets/d4rk3r/resumes-raw-pdf/tree/main/all-domains",
  );
  return rows
    .filter((entry) => String(entry.path ?? "").toLowerCase().endsWith(".pdf"))
    .map((entry) => ({
      file: path.basename(entry.path),
      url: `https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf/resolve/main/${entry.path}`,
      source: "https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf",
    }));
}

async function liveCareerCandidates() {
  const categories = await listing(
    "https://huggingface.co/api/datasets/BenjAndStr/resumes/tree/main/data/data",
  );
  const picks = [];
  for (const category of categories.filter((entry) => entry.type === "directory")) {
    const files = await listing(
      `https://huggingface.co/api/datasets/BenjAndStr/resumes/tree/main/${category.path}`,
    );
    const pdf = files.find((entry) => String(entry.path).toLowerCase().endsWith(".pdf"));
    if (!pdf) continue;
    const folder = category.path.split("/").pop();
    picks.push({
      file: `${folder}.pdf`,
      url: `https://huggingface.co/datasets/BenjAndStr/resumes/resolve/main/${pdf.path}`,
      source: "https://huggingface.co/datasets/BenjAndStr/resumes",
    });
  }
  return picks;
}

function choose(candidates, taken) {
  const pool = candidates.filter((item) => !taken.has(item.file.toLowerCase()));
  let state = SEED;
  for (let index = pool.length - 1; index > 0; index -= 1) {
    state = mix(state);
    const swap = state % (index + 1);
    const current = pool[index];
    pool[index] = pool[swap];
    pool[swap] = current;
  }
  return pool.slice(0, COUNT);
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed ${response.status} ${url}`);
  await pipeline(response.body, createWriteStream(destination));
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function main() {
  const taken = await existingNames();
  const candidates = [...(await rawPdfCandidates()), ...(await liveCareerCandidates())];
  const picks = choose(candidates, taken);
  if (picks.length < COUNT) {
    throw new Error(`Only ${picks.length} fresh PDFs available; wanted ${COUNT}.`);
  }
  const pdfDir = path.join(outDir, "pdf");
  await mkdir(pdfDir, { recursive: true });
  const rows = ["id,file,source,titles,companies,degrees,skills"];
  for (const [index, pick] of picks.entries()) {
    const id = `fresh-${String(index + 1).padStart(2, "0")}`;
    await download(pick.url, path.join(pdfDir, pick.file));
    rows.push([id, pick.file, pick.source, "", "", "", ""].map(csvCell).join(","));
    console.log(`saved ${id} ${pick.file}`);
  }
  await writeFile(path.join(outDir, "labels.csv"), `${rows.join("\n")}\n`);
  await writeFile(
    path.join(outDir, "README.txt"),
    [
      "Blank labelling sheet for the next held-out score.",
      "Fill titles, companies, degrees, and skills from the PDF before running any parser.",
      "Separate multiple values with a pipe. Leave a cell empty when the resume has none.",
      "Do not copy model output into this sheet. Do not commit these PDFs.",
      `Seed ${SEED}. Count ${picks.length}.`,
      "",
    ].join("\n"),
  );
  console.log(`fresh-heldout ${picks.length} pdfs, labels at ${path.join(outDir, "labels.csv")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
