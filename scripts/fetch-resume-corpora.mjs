/**
 * Download resume corpora for local extraction tests.
 * Files land in .data/resumes, which is gitignored.
 * DataTurks has no license: do not commit those files or ship them.
 *
 * Usage: node scripts/fetch-resume-corpora.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const root = path.join(process.cwd(), ".data/resumes");

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${url}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await pipeline(response.body, createWriteStream(destination));
}

function unique(values) {
  const seen = new Set();
  const rows = [];
  for (const value of values) {
    const text = value.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    rows.push(text);
  }
  return rows;
}

function spans(annotation, label) {
  return (annotation ?? []).flatMap((item) => {
    const labels = item.label ?? [];
    if (!labels.includes(label)) return [];
    return (item.points ?? []).map((point) => String(point.text ?? ""));
  });
}

async function dataturks() {
  const source = path.join(root, "dataturks-traindata.json");
  await download(
    "https://raw.githubusercontent.com/DataTurks-Engg/Entity-Recognition-In-Resumes-SpaCy/master/traindata.json",
    source,
  );
  const lines = (await readFile(source, "utf8")).split("\n").filter((line) => line.trim());
  const outDir = path.join(root, "dataturks");
  await mkdir(outDir, { recursive: true });
  const selected = lines.slice(0, 30);
  for (const [index, line] of selected.entries()) {
    const row = JSON.parse(line);
    const skills = spans(row.annotation, "Skills").flatMap((text) => text.split(/[,;/]/));
    const fixture = {
      id: `dataturks-${String(index + 1).padStart(2, "0")}`,
      text: row.content,
      titles: unique(spans(row.annotation, "Designation")),
      companies: unique(spans(row.annotation, "Companies worked at")),
      skills: unique(skills),
      credentials: unique(spans(row.annotation, "Degree")),
      projects: [],
      license: "none — local testing only, do not commit or ship",
      source: "https://github.com/DataTurks-Engg/Entity-Recognition-In-Resumes-SpaCy",
    };
    await writeFile(path.join(outDir, `${fixture.id}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  }
  console.log(`dataturks ${selected.length} of ${lines.length}`);
}

async function huggingfaceZip(repo, file, destination) {
  await download(`https://huggingface.co/datasets/${repo}/resolve/main/${file}`, destination);
  console.log(`downloaded ${file}`);
}

async function liveCareerSample() {
  const listing = await fetch(
    "https://huggingface.co/api/datasets/BenjAndStr/resumes/tree/main/data/data",
  );
  if (!listing.ok) throw new Error(`LiveCareer listing failed ${listing.status}`);
  const categories = (await listing.json()).filter((entry) => entry.type === "directory");
  const outDir = path.join(root, "livecareer");
  await mkdir(outDir, { recursive: true });
  let count = 0;
  for (const category of categories) {
    const files = await fetch(`https://huggingface.co/api/datasets/BenjAndStr/resumes/tree/main/${category.path}`);
    if (!files.ok) continue;
    const pdf = (await files.json()).find((entry) => String(entry.path).endsWith(".pdf"));
    if (!pdf) continue;
    const name = `${category.path.split("/").pop()}.pdf`;
    await download(
      `https://huggingface.co/datasets/BenjAndStr/resumes/resolve/main/${pdf.path}`,
      path.join(outDir, name),
    );
    count += 1;
  }
  console.log(`livecareer ${count} category pdfs`);
}

async function rawPdfSample() {
  const listing = await fetch(
    "https://huggingface.co/api/datasets/d4rk3r/resumes-raw-pdf/tree/main/all-domains",
  );
  if (!listing.ok) throw new Error(`Raw PDF listing failed ${listing.status}`);
  const pdfs = (await listing.json())
    .filter((entry) => String(entry.path).endsWith(".pdf") && entry.size)
    .sort((left, right) => left.size - right.size);
  const picks = [];
  if (pdfs.length > 0) {
    for (let index = 0; index < 35; index += 1) {
      const at = Math.round((index * (pdfs.length - 1)) / 34);
      picks.push(pdfs[at]);
    }
  }
  const outDir = path.join(root, "raw-pdf");
  await mkdir(outDir, { recursive: true });
  for (const pdf of picks) {
    await download(
      `https://huggingface.co/datasets/d4rk3r/resumes-raw-pdf/resolve/main/${pdf.path}`,
      path.join(outDir, path.basename(pdf.path)),
    );
  }
  console.log(`raw-pdf ${picks.length} of ${pdfs.length} (size spread, not the full set)`);
}

await mkdir(root, { recursive: true });
await dataturks();
await huggingfaceZip(
  "Mehyaar/Annotated_NER_PDF_Resumes",
  "ResumesPDF.zip",
  path.join(root, "annotated-ner/ResumesPDF.zip"),
);
await huggingfaceZip(
  "Mehyaar/Annotated_NER_PDF_Resumes",
  "ResumesJsonAnnotated.zip",
  path.join(root, "annotated-ner/ResumesJsonAnnotated.zip"),
);
await liveCareerSample();
await rawPdfSample();
