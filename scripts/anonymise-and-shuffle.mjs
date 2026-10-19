/**
 * Anonymise resume text files and shuffle their names.
 * Writes the join key under .data/ (gitignored). Does nothing without a source directory.
 *
 *   node scripts/anonymise-and-shuffle.mjs <source-dir>
 *
 * Do not run this for the LinkedIn protocol until the source dir is a real export.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Pass a directory of resume text files. Nothing was read.");
  process.exit(1);
}

function mix(state) {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

function anonymise(text) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "[phone]")
    .replace(/https?:\/\/\S+/gi, "[url]");
}

const dir = path.resolve(source);
const names = (await readdir(dir)).filter((name) => name.endsWith(".txt") || name.endsWith(".json"));
if (names.length === 0) {
  console.error("No .txt or .json resumes in that directory. Nothing was written.");
  process.exit(1);
}

const seed = createHash("sha256").update(randomBytes(16)).digest().readUInt32BE(0);
let state = seed;
const order = [...names];
for (let index = order.length - 1; index > 0; index -= 1) {
  state = mix(state);
  const swap = state % (index + 1);
  const current = order[index];
  order[index] = order[swap];
  order[swap] = current;
}

const outDir = path.join(process.cwd(), ".data/resumes/linkedin-blind");
await mkdir(outDir, { recursive: true });
const key = [];
for (const [index, name] of order.entries()) {
  const anon = `anon-${String(index + 1).padStart(3, "0")}.txt`;
  const raw = await readFile(path.join(dir, name), "utf8");
  const body = name.endsWith(".json") ? JSON.parse(raw).text ?? raw : raw;
  await writeFile(path.join(outDir, anon), anonymise(String(body)));
  key.push({ anon, source: name });
}
await writeFile(path.join(outDir, "key.json"), JSON.stringify({ seed, files: key }, null, 2));
console.log(`anonymised ${key.length} files into .data/resumes/linkedin-blind. Do not commit that folder.`);
