import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { heuristicResumeFields } from "@/lib/resumes/resume-field-extractor";

export const LABELLED_RESUME_DIR = path.join(process.cwd(), "lib/resumes/fixtures/labelled");

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

export function recall(expected: string[], got: string[]): number | null {
  if (expected.length === 0) return null;
  const found = expected.filter((value) => got.includes(value)).length;
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

/** Share of labelled values the parser found. One miss on a second job lowers the score. */
export async function scoreLabelledResumes() {
  const samples = await loadLabelledResumes();
  const totals = { titles: 0, companies: 0, skills: 0, credentials: 0, projects: 0 };
  const found = { titles: 0, companies: 0, skills: 0, credentials: 0, projects: 0 };
  for (const sample of samples) {
    const parsed = heuristicResumeFields(sample.text);
    const got = {
      titles: parsed?.experience.map((role) => role.title.value) ?? [],
      companies: parsed?.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])) ?? [],
      skills: parsed?.skills.map((skill) => skill.value) ?? [],
      credentials: parsed?.education.map((school) => school.credential.value) ?? [],
      projects: parsed?.projects.map((project) => project.name.value) ?? [],
    };
    for (const field of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[field] += sample[field].length;
      found[field] += sample[field].filter((value) => got[field].includes(value)).length;
    }
  }
  const accuracy = Object.fromEntries(
    (Object.keys(totals) as Array<keyof typeof totals>).map((field) => [
      field,
      totals[field] === 0 ? null : found[field] / totals[field],
    ]),
  );
  return { count: samples.length, labelled: totals, found, accuracy };
}
