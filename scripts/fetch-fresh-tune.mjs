/**
 * A new tune slice from the same public PDF source as the frozen held-out.
 * Does not touch .data/resumes/fresh-heldout.
 *
 *   node scripts/fetch-fresh-tune.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const COUNT = 12;
const SEED = 20261022;
const root = path.join(process.cwd(), ".data/resumes");
const outDir = path.join(root, "fresh-tune");

function mix(state) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

async function takenNames() {
  const names = new Set();
  const held = path.join(root, "fresh-heldout/pdf");
  try {
    for (const name of await readdir(held)) names.add(name.toLowerCase());
  } catch {
    // The frozen set is missing. Refusing to download into an unknown overlap.
    throw new Error("fresh-heldout/pdf is missing; refusing to pick a tune slice");
  }
  return names;
}

async function listing(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Listing failed ${response.status} ${url}`);
  return response.json();
}

async function main() {
  const taken = await takenNames();
  const rows = await listing("https://huggingface.co/api/datasets/d4rk3r/resumes-raw-pdf/tree/main/all-domains");
  const pool = rows
    .filter((entry) => String(entry.path ?? "").toLowerCase().endsWith(".pdf"))
    .map((entry) => ({
      file: path.basename(entry.path),
      url: `https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf/resolve/main/${entry.path}`,
      source: "https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf",
    }))
    .filter((item) => !taken.has(item.file.toLowerCase()));
  let state = SEED;
  for (let index = pool.length - 1; index > 0; index -= 1) {
    state = mix(state);
    const swap = state % (index + 1);
    const current = pool[index];
    pool[index] = pool[swap];
    pool[swap] = current;
  }
  const picks = pool.slice(0, COUNT);
  if (picks.length < COUNT) throw new Error(`Only ${picks.length} new PDFs`);
  const pdfDir = path.join(outDir, "pdf");
  await mkdir(pdfDir, { recursive: true });
  const sheet = ["id,file,source,titles,companies,degrees,skills,verified"];
  for (const [index, pick] of picks.entries()) {
    const id = `tune-${String(index + 1).padStart(2, "0")}`;
    const response = await fetch(pick.url);
    if (!response.ok || !response.body) throw new Error(`Download failed ${response.status}`);
    await pipeline(response.body, createWriteStream(path.join(pdfDir, pick.file)));
    sheet.push([id, pick.file, pick.source, "", "", "", "", "false"].join(","));
    console.log(`saved ${id} ${pick.file}`);
  }
  await writeFile(path.join(outDir, "labels.csv"), `${sheet.join("\n")}\n`);
  console.log(`fresh-tune ${picks.length} pdfs seed ${SEED}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
