/**
 * Rank resumes against eval/jobs and compare with recruiter ranks.
 *
 * Tune jobs: backend-dev, civil-site, electrical-maintenance.
 * Hold-out jobs: data-analyst, sales. Change the scorer only when the hold-out improves.
 *
 * recruiter_rank is blank until a person fills eval/matcher-human-rank.csv.
 * This dry run fills those blanks with DUMMY order ranks and labels every metric DUMMY.
 *
 *   pnpm exec tsx eval/score-ranking.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const TUNE = new Set(["backend-dev", "civil-site", "electrical-maintenance"]);
const HOLDOUT = new Set(["data-analyst", "sales"]);
const HALF_LIFE_YEARS = 4;
const THIS_YEAR = 2026;

type JobSpec = {
  id: string;
  must: string[];
  nice: string[];
  years: [number, number];
};

type Row = {
  jobId: string;
  candidateId: string;
  resumeFile: string;
  recruiterRank: number | null;
  notes: string;
};

function parseJob(file: string): JobSpec {
  const text = readFileSync(file, "utf8");
  const id = text.match(/^job_id:\s*(\S+)/m)?.[1] ?? path.basename(file, ".md");
  const section = (name: string) => {
    const match = text.match(new RegExp(`## ${name}\\s*([\\s\\S]*?)(?=\\n## |$)`));
    if (!match?.[1]) return [];
    return match[1]
      .split("\n")
      .map((line) => line.replace(/^- /, "").trim())
      .filter((line) => line && !line.startsWith("years:"));
  };
  const years = text.match(/years:\s*(\d+)\s*-\s*(\d+)/);
  return {
    id,
    must: section("Must-haves"),
    nice: section("Nice-to-haves"),
    years: [Number(years?.[1] ?? 0), Number(years?.[2] ?? 99)],
  };
}

function parseCsv(file: string): Row[] {
  const lines = readFileSync(file, "utf8").trim().split("\n").slice(1);
  return lines.filter(Boolean).map((line) => {
    const [jobId, candidateId, resumeFile, rank, notes] = line.split(",");
    const parsed = rank?.trim() ? Number(rank) : null;
    return {
      jobId: jobId ?? "",
      candidateId: candidateId ?? "",
      resumeFile: resumeFile ?? "",
      recruiterRank: parsed !== null && Number.isFinite(parsed) ? parsed : null,
      notes: notes ?? "",
    };
  });
}

function loadResume(resumeFile: string) {
  const full = path.join(process.cwd(), ".data/resumes/indian_resumes", resumeFile);
  const parsed = JSON.parse(readFileSync(full, "utf8")) as { text?: string };
  return parsed.text ?? "";
}

function quoteFor(text: string, phrase: string) {
  const at = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return null;
  return text.slice(at, at + phrase.length);
}

function recencyWeight(text: string, at: number) {
  const window = text.slice(Math.max(0, at - 200), Math.min(text.length, at + 200));
  const years = [...window.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  const year = years.length ? Math.max(...years) : null;
  if (year === null) return 0.5;
  const age = Math.max(0, THIS_YEAR - year);
  return 0.5 ** (age / HALF_LIFE_YEARS);
}

function yearsFit(text: string, range: [number, number]) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*years/i);
  if (!match) return 0.5;
  const years = Number(match[1]);
  if (years >= range[0] && years <= range[1]) return 1;
  if (years >= range[0] - 2 && years <= range[1] + 2) return 0.5;
  return 0.25;
}

function scoreResume(text: string, job: JobSpec) {
  const evidence: string[] = [];
  const misses: string[] = [];
  let mustScore = 0;
  for (const phrase of job.must) {
    const quote = quoteFor(text, phrase);
    if (!quote) {
      misses.push(`no evidence for ${phrase}`);
      continue;
    }
    const at = text.toLowerCase().indexOf(phrase.toLowerCase());
    const weight = recencyWeight(text, at);
    mustScore += weight;
    evidence.push(`${phrase}: "${quote}" (recency ${weight.toFixed(2)})`);
  }
  let niceHits = 0;
  for (const phrase of job.nice) {
    const quote = quoteFor(text, phrase);
    if (!quote) {
      misses.push(`no evidence for ${phrase}`);
      continue;
    }
    niceHits += 1;
    evidence.push(`${phrase}: "${quote}" (nice-to-have)`);
  }
  const mustPart = job.must.length === 0 ? 0 : mustScore / job.must.length;
  const nicePart = job.nice.length === 0 ? 0 : (0.25 * niceHits) / job.nice.length;
  const fit = yearsFit(text, job.years);
  return { score: mustPart + nicePart + 0.15 * fit, evidence, misses };
}

function spearman(left: number[], right: number[]) {
  const n = left.length;
  if (n < 2) return null;
  const rank = (values: number[]) => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(n);
    order.forEach((item, position) => {
      ranks[item.index] = position + 1;
    });
    return ranks;
  };
  const a = rank(left);
  const b = rank(right);
  const mean = (n + 1) / 2;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let index = 0; index < n; index += 1) {
    const xa = a[index]! - mean;
    const xb = b[index]! - mean;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

function main() {
  const jobs = readdirSync(path.join(process.cwd(), "eval/jobs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => parseJob(path.join(process.cwd(), "eval/jobs", name)));
  const rows = parseCsv(path.join(process.cwd(), "eval/matcher-human-rank.csv"));
  const humanFilled = rows.some((row) => row.recruiterRank !== null);
  const byJob = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byJob.get(row.jobId) ?? [];
    list.push(row);
    byJob.set(row.jobId, list);
  }
  const report: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const people = byJob.get(job.id) ?? [];
    const scored = people.map((person, index) => {
      const text = loadResume(person.resumeFile);
      const result = scoreResume(text, job);
      const dummyRank = index + 1;
      return {
        candidateId: person.candidateId,
        score: result.score,
        recruiterRank: humanFilled ? person.recruiterRank : dummyRank,
        evidence: result.evidence,
        misses: result.misses,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    const topScore = new Set(scored.slice(0, 5).map((row) => row.candidateId));
    const byHuman = [...scored].sort((a, b) => (a.recruiterRank ?? 999) - (b.recruiterRank ?? 999));
    const topHuman = new Set(byHuman.slice(0, 5).map((row) => row.candidateId));
    const overlap = [...topScore].filter((id) => topHuman.has(id)).length;
    const rho = spearman(
      scored.map((row) => row.score),
      scored.map((row) => row.recruiterRank ?? 0),
    );
    report.push({
      job: job.id,
      set: TUNE.has(job.id) ? "tune" : HOLDOUT.has(job.id) ? "holdout" : "unset",
      ranks: humanFilled ? "human" : "DUMMY",
      n: scored.length,
      top5Overlap: people.length ? Math.round((1000 * overlap) / 5) / 10 : null,
      precisionAt5: people.length ? Math.round((1000 * overlap) / 5) / 10 : null,
      spearman: rho === null ? null : Math.round(rho * 1000) / 1000,
      example: scored[0]
        ? { candidateId: scored[0].candidateId, evidence: scored[0].evidence, misses: scored[0].misses }
        : null,
    });
  }
  console.log(JSON.stringify({ ranks: humanFilled ? "human" : "DUMMY", jobs: report }, null, 2));
}

main();
