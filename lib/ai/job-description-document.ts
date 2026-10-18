import { createHash } from "crypto";

import { z } from "zod";

export const JD_TONES = ["startup", "corporate", "friendly"] as const;
export const JD_LENGTHS = ["short", "standard", "detailed"] as const;
export const JD_SECTIONS = [
  "summary",
  "responsibilities",
  "mustHaveSkills",
  "niceToHaveSkills",
  "hiringProcess",
  "screeningQuestions",
  "scoringRubric",
  "benefits",
] as const;

export type JdTone = (typeof JD_TONES)[number];
export type JdLength = (typeof JD_LENGTHS)[number];
export type JdSection = (typeof JD_SECTIONS)[number];

export type JdControls = {
  tone: JdTone;
  length: JdLength;
  india: {
    ctcInLpa: boolean;
    noticePeriod: boolean;
    cityOrHybrid: boolean;
  };
};

export const DEFAULT_JD_CONTROLS: JdControls = {
  tone: "corporate",
  length: "standard",
  india: { ctcInLpa: false, noticePeriod: false, cityOrHybrid: false },
};

const stringList = z.array(z.string().trim().min(1).max(400)).max(20);
const rubricItem = z
  .object({
    criterion: z.string().trim().min(1).max(200),
    signal: z.string().trim().min(1).max(400),
  })
  .strict();

export const jobDescriptionDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2000),
    responsibilities: stringList,
    mustHaveSkills: stringList,
    niceToHaveSkills: stringList,
    experienceRange: z.string().trim().min(1).max(120).nullable(),
    location: z.string().trim().min(1).max(200).nullable(),
    workMode: z.enum(["onsite", "hybrid", "remote"]).nullable(),
    compensation: z.string().trim().min(1).max(200).nullable(),
    benefits: stringList,
    hiringProcess: z.string().trim().min(1).max(1000).nullable(),
    screeningQuestions: stringList,
    scoringRubric: z.array(rubricItem).max(12),
  })
  .strict();

export type JobDescriptionDocument = z.infer<typeof jobDescriptionDocumentSchema>;

export const JOB_DESCRIPTION_JSON_SCHEMA = {
  name: "job_description",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      responsibilities: { type: "array", items: { type: "string" } },
      mustHaveSkills: { type: "array", items: { type: "string" } },
      niceToHaveSkills: { type: "array", items: { type: "string" } },
      experienceRange: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      workMode: { type: ["string", "null"], enum: ["onsite", "hybrid", "remote", null] },
      compensation: { type: ["string", "null"] },
      benefits: { type: "array", items: { type: "string" } },
      hiringProcess: { type: ["string", "null"] },
      screeningQuestions: { type: "array", items: { type: "string" } },
      scoringRubric: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            criterion: { type: "string" },
            signal: { type: "string" },
          },
          required: ["criterion", "signal"],
        },
      },
    },
    required: [
      "title",
      "summary",
      "responsibilities",
      "mustHaveSkills",
      "niceToHaveSkills",
      "experienceRange",
      "location",
      "workMode",
      "compensation",
      "benefits",
      "hiringProcess",
      "screeningQuestions",
      "scoringRubric",
    ],
  },
} as const;

export type BiasFlag = {
  phrase: string;
  suggestion: string;
};

export type QualityReport = {
  biasFlags: BiasFlag[];
  contradictions: string[];
  readability: { score: number; label: string };
  lengthWarning: string | null;
  missingInfo: string[];
};

const BIAS_RULES: Array<{ pattern: RegExp; phrase: string; suggestion: string }> = [
  { pattern: /\brockstar\b/i, phrase: "rockstar", suggestion: "skilled" },
  { pattern: /\bninja\b/i, phrase: "ninja", suggestion: "practitioner" },
  { pattern: /\bguru\b/i, phrase: "guru", suggestion: "specialist" },
  { pattern: /\byoung\b/i, phrase: "young", suggestion: "early-career" },
  { pattern: /\bnative speaker\b/i, phrase: "native speaker", suggestion: "professional working proficiency" },
  { pattern: /\bhe or she\b/i, phrase: "he or she", suggestion: "they" },
  { pattern: /\b(his|her)\b/i, phrase: "his/her", suggestion: "their" },
  { pattern: /\bdigital native\b/i, phrase: "digital native", suggestion: "comfortable with common workplace tools" },
];

export function findBiasFlags(text: string): BiasFlag[] {
  return BIAS_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => ({
    phrase: rule.phrase,
    suggestion: rule.suggestion,
  }));
}

function fleschReadingEase(text: string) {
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length || 1;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length || 1;
  const syllables = words.reduce((total, word) => {
    const groups = word.toLowerCase().match(/[aeiouy]+/g);
    return total + Math.max(1, groups?.length ?? 1);
  }, 0);
  const score = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function readabilityLabel(score: number) {
  if (score >= 60) return "Easy to read";
  if (score >= 40) return "Standard";
  return "Dense";
}

function looksJunior(experience: string | null) {
  return Boolean(experience && /\b(junior|intern|fresher|0\s*[-–]\s*2|entry)\b/i.test(experience));
}

export function findContradictions(document: JobDescriptionDocument): string[] {
  const notes: string[] = [];
  const years = document.mustHaveSkills
    .concat(document.experienceRange ?? "")
    .join(" ")
    .match(/(\d+)\+?\s*years/i);
  if (looksJunior(document.experienceRange) && years && Number(years[1]) >= 8) {
    notes.push(
      `${years[0]} does not fit a ${document.experienceRange} role. Lower the years or raise the seniority.`,
    );
  }
  const joined = document.mustHaveSkills.join(" ").toLowerCase();
  if (/\bno degree\b/.test(joined) && /\b(bachelor|master|phd|degree required)\b/.test(joined)) {
    notes.push("Must-haves both require and waive a degree.");
  }
  if (document.workMode === "remote" && document.location && /\bon-?site only\b/i.test(document.location)) {
    notes.push("Work mode is remote while location says on-site only.");
  }
  return notes;
}

export type GroundingSource = {
  title: string;
  experienceRange: string | null;
  location: string | null;
  compensationRange: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  primarySkills: string | null;
  jobDescription: string | null;
  companyName?: string | null;
  companyIndustry?: string | null;
};

export function listMissingInfo(source: GroundingSource): string[] {
  const missing: string[] = [];
  if (!source.title.trim()) missing.push("Role title");
  if (!source.experienceRange?.trim()) missing.push("Experience or seniority");
  if (!source.location?.trim()) missing.push("Location or work mode");
  if (!source.compensationRange?.trim()) missing.push("Compensation");
  if (!source.mustHaveRequirements?.trim() && !source.primarySkills?.trim()) {
    missing.push("Must-have skills");
  }
  if (!source.companyName?.trim()) missing.push("Company name");
  return missing;
}

export function groundDocument(
  document: JobDescriptionDocument,
  source: GroundingSource,
): JobDescriptionDocument {
  return {
    ...document,
    experienceRange: source.experienceRange?.trim() ? document.experienceRange : null,
    location: source.location?.trim() ? document.location : null,
    compensation: source.compensationRange?.trim() ? document.compensation : null,
    benefits: source.jobDescription && /\bbenefit/i.test(source.jobDescription) ? document.benefits : [],
    workMode: source.location?.trim() ? document.workMode : null,
  };
}

export function renderPlainJobDescription(document: JobDescriptionDocument) {
  const lines = [
    document.title,
    "",
    document.summary,
    "",
    "Responsibilities",
    ...document.responsibilities.map((item) => `- ${item}`),
    "",
    "Required",
    ...document.mustHaveSkills.map((item) => `- ${item}`),
  ];
  if (document.niceToHaveSkills.length > 0) {
    lines.push("", "Preferred", ...document.niceToHaveSkills.map((item) => `- ${item}`));
  }
  if (document.experienceRange) lines.push("", `Experience: ${document.experienceRange}`);
  if (document.location) lines.push(`Location: ${document.location}`);
  if (document.workMode) lines.push(`Work mode: ${document.workMode}`);
  if (document.compensation) lines.push(`Compensation: ${document.compensation}`);
  if (document.benefits.length > 0) {
    lines.push("", "Benefits", ...document.benefits.map((item) => `- ${item}`));
  }
  if (document.hiringProcess) lines.push("", `Hiring process: ${document.hiringProcess}`);
  return lines.join("\n").trim();
}

export function boardCopies(document: JobDescriptionDocument) {
  const plain = renderPlainJobDescription(document);
  const compact = [document.title, document.summary, document.mustHaveSkills.join(", ")]
    .filter(Boolean)
    .join("\n");
  return {
    naukri: plain.slice(0, 4000),
    linkedin: compact.slice(0, 2000),
    indeed: plain.slice(0, 4500),
  };
}

export function assessJobDescription(
  document: JobDescriptionDocument,
  source: GroundingSource,
): QualityReport {
  const plain = renderPlainJobDescription(document);
  const words = plain.split(/\s+/).filter(Boolean).length;
  const score = fleschReadingEase(plain);
  return {
    biasFlags: findBiasFlags(plain),
    contradictions: findContradictions(document),
    readability: { score, label: readabilityLabel(score) },
    lengthWarning:
      words > 700
        ? `About ${words} words. Shorten it before posting.`
        : words < 40
          ? `About ${words} words. Add responsibilities before posting.`
          : null,
    missingInfo: listMissingInfo(source),
  };
}

export type StoredJobDescriptionProposal = {
  schemaVersion: 2;
  jobDescription: string;
  document: JobDescriptionDocument;
  quality: QualityReport;
  boards: ReturnType<typeof boardCopies>;
  controls: JdControls;
};

export function packProposal(input: {
  document: JobDescriptionDocument;
  source: GroundingSource;
  controls: JdControls;
}): StoredJobDescriptionProposal {
  const document = groundDocument(input.document, input.source);
  return {
    schemaVersion: 2,
    jobDescription: renderPlainJobDescription(document),
    document,
    quality: assessJobDescription(document, input.source),
    boards: boardCopies(document),
    controls: input.controls,
  };
}

export function parseStoredProposal(raw: string | null | undefined): StoredJobDescriptionProposal | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredJobDescriptionProposal;
    if (parsed?.schemaVersion !== 2 || typeof parsed.jobDescription !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function acceptedJobDescriptionText(raw: string) {
  return parseStoredProposal(raw)?.jobDescription ?? raw.trim();
}

export function rubricItemsFromPayload(payload: unknown): Array<{ criterion: string; signal: string }> {
  const matcher = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { jdMatcher?: { scoringRubric?: unknown } }).jdMatcher
    : null;
  if (!matcher || !Array.isArray(matcher.scoringRubric)) return [];
  return matcher.scoringRubric.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const criterion = (item as { criterion?: unknown }).criterion;
    const signal = (item as { signal?: unknown }).signal;
    if (typeof criterion !== "string" || !criterion.trim()) return [];
    return [{ criterion: criterion.trim(), signal: typeof signal === "string" ? signal.trim() : "" }];
  });
}

export function matcherSignalsFromPayload(payload: unknown): {
  screeningQuestions: string[];
  rubricCriteria: string[];
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { screeningQuestions: [], rubricCriteria: [] };
  }
  const matcher = (payload as { jdMatcher?: unknown }).jdMatcher;
  if (!matcher || typeof matcher !== "object" || Array.isArray(matcher)) {
    return { screeningQuestions: [], rubricCriteria: [] };
  }
  const record = matcher as {
    screeningQuestions?: unknown;
    scoringRubric?: unknown;
  };
  const screeningQuestions = Array.isArray(record.screeningQuestions)
    ? record.screeningQuestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const rubricCriteria = Array.isArray(record.scoringRubric)
    ? record.scoringRubric.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const criterion = (item as { criterion?: unknown }).criterion;
        return typeof criterion === "string" && criterion.trim() ? [criterion.trim()] : [];
      })
    : [];
  return { screeningQuestions, rubricCriteria };
}

export function hashJobDescriptionRequest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function parseJobDescriptionControls(value: unknown): JdControls {
  if (!value || typeof value !== "object") return DEFAULT_JD_CONTROLS;
  const record = value as Record<string, unknown>;
  const india = (record.india ?? {}) as Record<string, unknown>;
  const tone = JD_TONES.includes(record.tone as JdTone) ? (record.tone as JdTone) : "corporate";
  const length = JD_LENGTHS.includes(record.length as JdLength)
    ? (record.length as JdLength)
    : "standard";
  return {
    tone,
    length,
    india: {
      ctcInLpa: Boolean(india.ctcInLpa),
      noticePeriod: Boolean(india.noticePeriod),
      cityOrHybrid: Boolean(india.cityOrHybrid),
    },
  };
}

export function mergeJobDescriptionSection(
  document: JobDescriptionDocument,
  section: JdSection,
  value: unknown,
): JobDescriptionDocument {
  const next = { ...document, [section]: value };
  return jobDescriptionDocumentSchema.parse(next);
}

export type TitleSeo = {
  ok: boolean;
  issues: string[];
};

/** Job-board title check: readable length, no shouted text, no biased filler. */
export function seoTitleCheck(title: string): TitleSeo {
  const issues: string[] = [];
  const trimmed = title.trim();
  if (trimmed.length < 8) issues.push("Title is too short for a job board.");
  if (trimmed.length > 70) issues.push("Title is longer than 70 characters.");
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) issues.push("Title is all capitals.");
  if (findBiasFlags(trimmed).length > 0) issues.push("Title uses biased wording.");
  if (!/[a-z]/i.test(trimmed)) issues.push("Title has no letters.");
  return { ok: issues.length === 0, issues };
}

export function salaryTransparencyNudge(compensation: string | null | undefined) {
  if (compensation?.trim()) return null;
  return "Add a salary or CTC range. Listings with pay are easier to trust and get more qualified applicants.";
}

export function applyBiasRewrites(text: string) {
  let next = text;
  for (const rule of BIAS_RULES) {
    next = next.replace(rule.pattern, rule.suggestion);
  }
  return next;
}

function wordsOf(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

/** Expand a structured role into a detailed post of about 400 words, using only given facts. */
export function detailedJobDescription(document: JobDescriptionDocument, source: GroundingSource) {
  const company = source.companyName?.trim() || "the company";
  const skills = document.mustHaveSkills.filter(Boolean);
  const preferred = document.niceToHaveSkills.filter(Boolean);
  const duties = document.responsibilities.filter(Boolean);
  const sentences = [
    `${document.title} at ${company}. ${document.summary}`.trim(),
    document.experienceRange ? `Experience asked for: ${document.experienceRange}.` : "",
    document.location ? `Location: ${document.location}.` : "",
    document.workMode ? `Work mode: ${document.workMode}.` : "",
    document.compensation ? `Compensation: ${document.compensation}.` : "",
    duties.length
      ? `In this role you will ${duties.map((item) => item.replace(/\.$/, "")).join("; ")}.`
      : "",
    skills.length
      ? `Required skills are ${skills.join(", ")}. Each of these should show up in work you have already done, with an example you can talk through.`
      : "",
    preferred.length ? `Helpful extras are ${preferred.join(", ")}.` : "",
    document.hiringProcess ? `Hiring process: ${document.hiringProcess}.` : "",
    document.benefits.length ? `Benefits include ${document.benefits.join(", ")}.` : "",
  ].filter(Boolean);
  const elaboration = skills.flatMap((skill) => [
    `For ${skill}, describe the system you worked on, who used it, and what changed because of your work.`,
    `Interviewers will ask how you learned ${skill} and how you decide when it is the right tool.`,
  ]);
  const dutyNotes = duties.flatMap((duty) => [
    `About “${duty.replace(/\.$/, "")}”: say what you owned, what you handed off, and how you knew it was done.`,
  ]);
  const parts = [...sentences, ...dutyNotes, ...elaboration];
  let text = "";
  for (const part of parts) {
    const next = `${text} ${part}`.trim();
    if (wordsOf(next).length > 460) break;
    text = next;
  }
  while (wordsOf(text).length < 360 && skills.length > 0) {
    const skill = skills[wordsOf(text).length % skills.length];
    text = `${text} Bring one story about ${skill} that includes a constraint, a choice, and a result.`.trim();
    if (wordsOf(text).length > 460) break;
  }
  return text.trim();
}

export function jobDescriptionVariants(document: JobDescriptionDocument, source: GroundingSource) {
  return {
    detailed: detailedJobDescription(document, source),
    compact: boardCopies(document).linkedin,
  };
}

export function diffWords(current: string, proposed: string) {
  const currentWords = new Set(current.toLowerCase().split(/\s+/).filter(Boolean));
  const proposedWords = new Set(proposed.toLowerCase().split(/\s+/).filter(Boolean));
  return {
    removed: current.split(/\s+/).filter((word) => word && !proposedWords.has(word.toLowerCase())),
    added: proposed.split(/\s+/).filter((word) => word && !currentWords.has(word.toLowerCase())),
  };
}
