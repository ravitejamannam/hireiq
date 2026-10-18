import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { heuristicResumeFields, summarizeExperience, tenureMonths } from "@/lib/resumes/resume-field-extractor";
import { layoutLines } from "@/lib/resumes/resume-span-miner";

type Row = {
  content: string;
  annotation?: Array<{ label?: string[]; points?: Array<{ text?: string }> }>;
};

function loadCorpus(): Row[] {
  const root = path.join(process.cwd(), ".data/resumes");
  const files = ["dataturks-traindata.json", "dataturks-testdata.json"].map((name) => path.join(root, name));
  if (!files.every((file) => existsSync(file))) return [];
  return files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Row),
  );
}

function spans(row: Row, label: string) {
  const values: string[] = [];
  for (const annotation of row.annotation ?? []) {
    if (!(annotation.label ?? []).includes(label)) continue;
    for (const point of annotation.points ?? []) {
      const text = String(point.text ?? "").trim();
      if (text) values.push(text);
    }
  }
  return values;
}

const HAND_PROJECTS: Record<number, string> = {
  1: "Cadence",
  10: "RB (Reckitt Benckiser)",
  21: "Oracle Master Data Management",
  26: "CAWP",
  29: "CBIL",
  34: "E-Banking solutions",
  36: "SAP HR",
  44: "Johannesburg Distribution Center",
};

describe("DataTurks resume accuracy", () => {
  const corpus = loadCorpus();

  it.skipIf(corpus.length === 0)("scores titles, companies, and degrees on all 220 resumes", () => {
    expect(corpus.length).toBe(220);
    const totals = { titles: [0, 0], companies: [0, 0], degrees: [0, 0] };
    const started = performance.now();
    const durations: number[] = [];
    for (const row of corpus) {
      const t0 = performance.now();
      const fields = heuristicResumeFields(row.content);
      durations.push(performance.now() - t0);
      const got = {
        titles: fields?.experience.map((role) => role.title.value) ?? [],
        companies: fields?.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])) ?? [],
        degrees: fields?.education.map((school) => school.credential.value) ?? [],
      };
      const expected = {
        titles: spans(row, "Designation"),
        companies: spans(row, "Companies worked at"),
        degrees: spans(row, "Degree"),
      };
      for (const field of Object.keys(totals) as Array<keyof typeof totals>) {
        for (const label of expected[field]) {
          if (!row.content.includes(label.trim())) continue;
          totals[field][1] += 1;
          if (got[field].some((value) => labelsMatch(label, value))) totals[field][0] += 1;
        }
      }
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? 0;
    const scores = {
      titles: totals.titles[0] / totals.titles[1],
      companies: totals.companies[0] / totals.companies[1],
      degrees: totals.degrees[0] / totals.degrees[1],
      p95ms: Math.round(p95 * 100) / 100,
      elapsedMs: Math.round(performance.now() - started),
    };
    console.info("dataturks", scores);
    expect(scores.titles).toBeGreaterThanOrEqual(0.9);
    expect(scores.companies).toBeGreaterThanOrEqual(0.9);
    expect(scores.degrees).toBeGreaterThanOrEqual(0.9);
    expect(scores.p95ms).toBeLessThan(8000);
  });

  it.skipIf(corpus.length === 0)("scores hand-labelled skills and projects on 50 resumes", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(50);
    const sample = corpus.slice(0, 50);
    let skillFound = 0;
    let skillTotal = 0;
    let projectFound = 0;
    let projectTotal = 0;
    sample.forEach((row, index) => {
      const fields = heuristicResumeFields(row.content);
      const skills = fields?.skills.map((skill) => skill.value) ?? [];
      for (const span of spans(row, "Skills")) {
        const tokens = span
          .split(/[,|\n•]/)
          .map((part) => part.trim())
          .filter((part) => part.length >= 3 && part.length <= 40);
        for (const token of tokens) {
          if (!row.content.includes(token)) continue;
          skillTotal += 1;
          if (skills.some((skill) => labelsMatch(token, skill))) skillFound += 1;
        }
      }
      const expectedProject = HAND_PROJECTS[index];
      if (!expectedProject) return;
      projectTotal += 1;
      const projects = fields?.projects.map((project) => project.name.value) ?? [];
      if (projects.some((name) => labelsMatch(expectedProject, name))) projectFound += 1;
    });
    const skillRecall = skillTotal === 0 ? 0 : skillFound / skillTotal;
    const projectRecall = projectTotal === 0 ? 0 : projectFound / projectTotal;
    console.info("hand-label", { resumes: 50, skillRecall, skillTotal, projectRecall, projectTotal });
    expect(skillRecall).toBeGreaterThan(0);
    expect(projectRecall).toBeGreaterThanOrEqual(0.5);
  });
});

describe("resume experience summary", () => {
  it("reads a current role and total years, and dedupes skill aliases", () => {
    const text = [
      "Ada Lovelace",
      "Skills: ReactJS, React, PostgreSQL",
      "Senior Software Engineer",
      "Northwind Labs",
      "January 2020 to Present",
      "Engineer",
      "Contoso",
      "January 2016 to December 2019",
    ].join("\n");
    const fields = heuristicResumeFields(text);
    expect(fields?.skills.map((skill) => skill.value)).toEqual(["React", "PostgreSQL"]);
    const summary = summarizeExperience(
      (fields?.experience ?? []).map((role) => ({
        title: role.title.value,
        organization: role.organization?.value ?? null,
        startDate: role.startDate?.value ?? null,
        endDate: role.endDate?.value ?? null,
      })),
      new Date("2024-01-01T00:00:00Z"),
    );
    expect(summary.currentTitle).toBe("Senior Software Engineer");
    expect(summary.totalYears).toBeGreaterThan(7);
    expect(tenureMonths("Jan 2020", "Present", new Date("2024-01-01T00:00:00Z"))).toBe(48);
  });

  it("reads a two-column line as left then right", () => {
    const column = Array.from({ length: 8 }, (_, index) => `Left role ${index}     Right note ${index}`).join("\n");
    const ordered = layoutLines(column);
    expect(ordered.indexOf("Left role 0")).toBeLessThan(ordered.indexOf("Right note 0"));
    expect(ordered.indexOf("Left role 7")).toBeLessThan(ordered.indexOf("Right note 0"));
  });
});
