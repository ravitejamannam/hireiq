import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalDegree, degreesMatch } from "@/lib/resumes/degree-canonical";
import { employersMatch } from "@/lib/resumes/employer-aliases";
import { proposeResumeFields } from "@/lib/resumes/resume-field-extractor";

export const LABELLED_RESUME_DIR =
  process.env.LABELLED_RESUME_DIR ?? path.join(process.cwd(), "lib/resumes/fixtures/labelled");

export type LabelledResume = {
  id: string;
  text: string;
  titles: string[];
  companies: string[];
  skills: string[];
  credentials: string[];
  projects: string[];
};

function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function foldLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\b(in|of|the|and|at)\b/g, " ")
    .replace(/\s+/g, "");
}

/** Lowercase, ignore punctuation and filler words, and allow either side to contain the other. */
export function labelsMatch(expected: string, actual: string) {
  if (degreesMatch(expected, actual) || employersMatch(expected, actual)) return true;
  const needle = foldLabel(expected);
  const hay = foldLabel(actual);
  if (needle.length < 2 || hay.length < 2) return false;
  return hay.includes(needle) || needle.includes(hay);
}

export function recall(expected: string[], got: string[]): number | null {
  if (expected.length === 0) return null;
  const found = expected.filter((value) => got.some((item) => labelsMatch(value, item))).length;
  return found / expected.length;
}

export async function loadLabelledResumes(): Promise<LabelledResume[]> {
  let names: string[] = [];
  try {
    names = await readdir(LABELLED_RESUME_DIR);
  } catch {
    return [];
  }
  const files = names.filter((name) => name.endsWith(".json")).sort();
  const rows: LabelledResume[] = [];
  for (const name of files) {
    const raw = JSON.parse(await readFile(path.join(LABELLED_RESUME_DIR, name), "utf8")) as Record<string, unknown>;
    if (typeof raw.text !== "string" || !raw.text.trim()) continue;
    rows.push({
      id: typeof raw.id === "string" ? raw.id : name,
      text: raw.text,
      titles: asList(raw.titles ?? raw.title),
      companies: asList(raw.companies ?? raw.company),
      skills: asList(raw.skills ?? raw.skill),
      credentials: asList(raw.credentials ?? raw.credential),
      projects: asList(raw.projects ?? raw.project),
    });
  }
  return rows;
}

type ScoreField = "titles" | "companies" | "skills" | "credentials" | "projects";

function emptyCounts() {
  return { titles: 0, companies: 0, skills: 0, credentials: 0, projects: 0 };
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/** Share of labelled values the parser found. Labels absent from the text are scored apart. */
export async function scoreLabelledResumes() {
  const samples = await loadLabelledResumes();
  const grounded = emptyCounts();
  const found = emptyCounts();
  const ungrounded = emptyCounts();
  const misses: Array<{ id: string; field: ScoreField; expected: string }> = [];
  const parsed = await mapPool(samples, 4, (sample) => proposeResumeFields(sample.text));
  samples.forEach((sample, index) => {
    const fields = parsed[index];
    const got: Record<ScoreField, string[]> = {
      titles: fields?.experience.map((role) => role.title.value) ?? [],
      companies: fields?.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])) ?? [],
      skills: fields?.skills.map((skill) => skill.value) ?? [],
      credentials: fields?.education.map((school) => school.credential.value) ?? [],
      projects: fields?.projects.map((project) => project.name.value) ?? [],
    };
    for (const field of Object.keys(grounded) as ScoreField[]) {
      for (const expected of sample[field]) {
        const degreeLabel = field === "credentials";
        if (degreeLabel && !canonicalDegree(expected)) {
          ungrounded[field] += 1;
          continue;
        }
        if (!sample.text.includes(expected.trim())) {
          ungrounded[field] += 1;
          continue;
        }
        grounded[field] += 1;
        if (got[field].some((value) => labelsMatch(expected, value))) {
          found[field] += 1;
        } else if (misses.filter((row) => row.field === field).length < 8) {
          misses.push({ id: sample.id, field, expected: expected.replace(/\s+/g, " ").trim().slice(0, 80) });
        }
      }
    }
  });
  const accuracy = Object.fromEntries(
    (Object.keys(grounded) as ScoreField[]).map((field) => [
      field,
      grounded[field] === 0 ? null : found[field] / grounded[field],
    ]),
  );
  return { count: samples.length, labelled: grounded, found, ungrounded, accuracy, misses };
}
