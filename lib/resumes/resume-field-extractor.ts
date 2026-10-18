import type { AiRunScope } from "@/lib/ai/ai-run";
import { runGuardedCompletion } from "@/lib/ai/guarded-completion";
import { getOpenAiApiKey } from "@/lib/ai/job-description-generator";
import { acceptResumeFields, type ResumeFields } from "@/lib/resumes/resume-fields";
import { canonicalDegree } from "@/lib/resumes/degree-canonical";
import { canonicalEmployer } from "@/lib/resumes/employer-aliases";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";

const FIELD_INSTRUCTIONS = `Extract resume fields as JSON. Use null when a value is not written in the resume.
Every value must include a quote copied exactly from the resume. Do not add keys.

Indian education is usually a degree line, then the college, then the years. The credential is the degree, not the college.
Example:
EDUCATION
B.Tech in Computer Science
Osmania University
2011 to 2015
Bachelor of Technology in Computer Science
University College of Engineering
2005
MCA
Osmania University
Treat B.Tech, BTech, and Bachelor of Technology as the degree. Do not put the college in the credential field.

Extract every employer listed, including earlier roles and roles without dates. A job may be a header such as "Associate consultant@SAP labs", a line such as "fresher job Accenture", or an older block further down the page. Do not stop after the most recent role.
Shape:
{"fullName":{"value":"","quote":""}|null,"email":{"value":"","quote":""}|null,"phone":{"value":"","quote":""}|null,"skills":[{"value":"","quote":""}],"experience":[{"title":{"value":"","quote":""},"organization":{"value":"","quote":""}|null,"startDate":{"value":"","quote":""}|null,"endDate":{"value":"","quote":""}|null}],"education":[{"credential":{"value":"","quote":""},"institution":{"value":"","quote":""}|null}],"certifications":[{"value":"","quote":""}],"projects":[{"name":{"value":"","quote":""}}]}`;

function quoted(value: string, source: string): { value: string; quote: string } | null {
  const trimmed = value.trim();
  if (!trimmed || !source.includes(trimmed)) return null;
  return { value: trimmed, quote: trimmed };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SECTION_LINE = /^(work experience|professional experience|experience|education|skills|technical skills|projects?|summary|additional information|certifications?)$/i;
const DATE_LINE = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4})\b/i;
const DEGREE_PATTERN = /\b(B\.?\s?Tech|M\.?\s?Tech|B\.?\s?Sc|M\.?\s?Sc|B\.?\s?Com|M\.?\s?Com|B\.?\s?E|M\.?\s?E|MCA|MBA|B\.E|M\.E)\b/i;

function isRoleHeading(line: string) {
  const words = line.split(/\s+/);
  return (
    words.length >= 1 &&
    words.length <= 8 &&
    line.length <= 60 &&
    !SECTION_LINE.test(line) &&
    !DATE_LINE.test(line) &&
    !/[.!?]$/.test(line) &&
    !/@/.test(line)
  );
}

/** Months between two "Mon YYYY" dates. Null when either date is not that shape. */
export function tenureMonths(start: string, end: string): number | null {
  const parse = (value: string) => {
    const match = value.trim().toLowerCase().match(/^([a-z]{3,9})\s+(\d{4})$/);
    if (!match) return null;
    const month = MONTHS.findIndex((name) => match[1].startsWith(name));
    if (month < 0) return null;
    return Number(match[2]) * 12 + month;
  };
  const from = parse(start);
  const to = parse(end === "Present" ? "" : end);
  if (from === null || to === null || to < from) return null;
  return to - from;
}

/** Grounded fallback used when no model is configured or the model output is rejected. */
export function heuristicResumeFields(source: string): ResumeFields | null {
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = source.match(/(?:\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim() ?? null;
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nameLine = lines.find((line) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(line)) ?? null;
  const skillLine = lines.find((line) => /^skills?\s*[:\-]/i.test(line));
  const skills = skillLine
    ? skillLine
        .replace(/^skills?\s*[:\-]\s*/i, "")
        .split(/,|·|\|/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const field = quoted(part, source);
          if (!field) return null;
          return { ...field, value: canonicalSkill(part) };
        })
        .filter((part): part is { value: string; quote: string } => part !== null)
    : [];
  const used = new Set<string>();
  const experience = lines.flatMap((line) => {
    const match = line.match(/^(.{2,80}?)\s+at\s+(.+?)\s+\((.+?)\s+-\s+(.+?)\)$/i);
    if (!match) {
      const simple = line.match(/^(.{2,80}?)\s+at\s+(.{2,80})$/i);
      if (!simple) return [];
      const title = quoted(simple[1].trim(), source);
      const organization = quoted(simple[2].trim(), source);
      if (!title) return [];
      return [{ title, organization, startDate: null, endDate: null }];
    }
    const title = quoted(match[1].trim(), source);
    const organization = quoted(match[2].trim(), source);
    const startDate = quoted(match[3].trim(), source);
    const endDate = quoted(match[4].trim(), source);
    if (!title) return [];
    used.add(line);
    return [{ title, organization, startDate, endDate }];
  });
  for (let index = 0; index < lines.length - 1; index += 1) {
    const titleLine = lines[index];
    const companyLine = lines[index + 1];
    const following = lines[index + 2] ?? "";
    if (used.has(titleLine) || !isRoleHeading(titleLine) || !isRoleHeading(companyLine)) continue;
    if (DEGREE_PATTERN.test(titleLine) || !DATE_LINE.test(following)) continue;
    const title = quoted(titleLine, source);
    const organization = quoted(companyLine, source);
    if (!title) continue;
    used.add(titleLine);
    experience.push({ title, organization, startDate: null, endDate: null });
  }
  const education = lines.flatMap((line) => {
    const match = line.match(/^education\s*[:\-]\s*(.{2,80}?)\s+at\s+(.{2,80})$/i);
    if (!match) {
      const bare = line.match(/^education\s*[:\-]\s*(.{2,80})$/i);
      if (!bare) return [];
      const credential = quoted(bare[1].trim(), source);
      if (!credential) return [];
      return [{ credential, institution: null }];
    }
    const credential = quoted(match[1].trim(), source);
    const institution = quoted(match[2].trim(), source);
    if (!credential) return [];
    return [{ credential, institution }];
  });
  for (const line of lines) {
    const degree = line.match(DEGREE_PATTERN);
    if (!degree) continue;
    const credential = quoted(degree[0].replace(/\s+/g, " ").trim(), source) ?? quoted(line, source);
    if (!credential) continue;
    if (education.some((row) => row.credential.value === credential.value)) continue;
    education.push({ credential, institution: null });
  }
  const certifications = lines.flatMap((line) => {
    const match = line.match(/^certifications?\s*[:\-]\s*(.{2,120})$/i);
    if (!match) return [];
    const field = quoted(match[1].trim(), source);
    return field ? [field] : [];
  });
  const projects = lines.flatMap((line) => {
    const match = line.match(/^projects?\s*[:\-]\s*(.{2,120})$/i);
    if (!match) return [];
    const name = quoted(match[1].trim(), source);
    return name ? [{ name }] : [];
  });

  const accepted = acceptResumeFields(
    {
      fullName: nameLine ? quoted(nameLine, source) : null,
      email: email ? quoted(email, source) : null,
      phone: phone ? quoted(phone, source) : null,
      skills,
      experience,
      education,
      certifications,
      projects,
    },
    source,
  );
  return accepted.ok ? normalizeResumeFields(accepted.fields) : null;
}

function normalizeResumeFields(fields: ResumeFields): ResumeFields {
  return {
    ...fields,
    skills: fields.skills.map((skill) => ({ ...skill, value: canonicalSkill(skill.value) })),
    experience: fields.experience.map((role) => {
      const employer = role.organization ? canonicalEmployer(role.organization.value) : null;
      return employer && role.organization
        ? { ...role, organization: { ...role.organization, value: employer } }
        : role;
    }),
    education: fields.education.map((school) => {
      const degree = canonicalDegree(school.credential.value);
      return degree ? { ...school, credential: { ...school.credential, value: degree } } : school;
    }),
  };
}

const QUOTED = {
  type: "object",
  additionalProperties: false,
  required: ["value", "quote"],
  properties: { value: { type: "string" }, quote: { type: "string" } },
} as const;

const RESUME_FIELDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fullName", "email", "phone", "skills", "experience", "education", "certifications", "projects"],
  properties: {
    fullName: { anyOf: [QUOTED, { type: "null" }] },
    email: { anyOf: [QUOTED, { type: "null" }] },
    phone: { anyOf: [QUOTED, { type: "null" }] },
    skills: { type: "array", items: QUOTED },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "organization", "startDate", "endDate"],
        properties: {
          title: QUOTED,
          organization: { anyOf: [QUOTED, { type: "null" }] },
          startDate: { anyOf: [QUOTED, { type: "null" }] },
          endDate: { anyOf: [QUOTED, { type: "null" }] },
        },
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["credential", "institution"],
        properties: {
          credential: QUOTED,
          institution: { anyOf: [QUOTED, { type: "null" }] },
        },
      },
    },
    certifications: { type: "array", items: QUOTED },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: QUOTED },
      },
    },
  },
} as const;

export type ResumeFieldGuard = {
  optedOut: boolean;
  scope?: AiRunScope | null;
};

async function fieldsFromModel(source: string, guard?: ResumeFieldGuard): Promise<ResumeFields | null> {
  if (guard?.optedOut) return null;
  const key = getOpenAiApiKey();
  if (!key) return null;
  const model = process.env.OPENAI_RESUME_FIELDS_MODEL?.trim() || "gpt-4o-mini";
  const timeoutMs = source.length > 6_000 ? 28_000 : 12_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const outcome = await runGuardedCompletion({
        optedOut: false,
        scope: guard?.scope,
        request: {
          feature: "resume_fields",
          model,
          promptVersion: "resume-fields-3",
          system: FIELD_INSTRUCTIONS,
          user: source.slice(0, 12_000),
          schemaName: "resume_fields",
          schema: RESUME_FIELDS_SCHEMA,
          timeoutMs,
          maxRetries: 0,
          apiKey: key,
        },
      });
      const accepted = acceptResumeFields(outcome.result?.parsed, source);
      if (!accepted.ok) return null;
      return normalizeResumeFields(accepted.fields);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const timedOut = /timeout|aborted|abort/i.test(message);
      if (attempt === 0 && timedOut) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function proposeResumeFields(
  source: string,
  guard?: ResumeFieldGuard,
): Promise<ResumeFields | null> {
  if (guard?.optedOut) return heuristicResumeFields(source);
  return (await fieldsFromModel(source, guard)) ?? heuristicResumeFields(source);
}

export type ResumeFormSuggestion = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  experiences: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    tenure: string;
  }>;
  education: Array<{ credential: string; institution: string }>;
  projects: Array<{ name: string }>;
  certifications: string[];
  skills: string[];
};

function tenureLabel(start: string, end: string): string {
  const months = tenureMonths(start, end);
  if (months === null) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years && rest) return `${years} yr ${rest} mo`;
  if (years) return `${years} yr`;
  return `${rest} mo`;
}

export function suggestionFromFields(fields: ResumeFields): ResumeFormSuggestion {
  return {
    fullName: fields.fullName?.value ?? null,
    email: fields.email?.value ?? null,
    phone: fields.phone?.value ?? null,
    skills: fields.skills.map((skill) => skill.value),
    experiences: fields.experience.map((role) => {
      const startDate = role.startDate?.value ?? "";
      const endDate = role.endDate?.value ?? "";
      return {
        title: role.title.value,
        company: role.organization?.value ?? "",
        startDate,
        endDate,
        tenure: startDate && endDate ? tenureLabel(startDate, endDate) : "",
      };
    }),
    education: fields.education.map((school) => ({
      credential: school.credential.value,
      institution: school.institution?.value ?? "",
    })),
    projects: fields.projects.map((project) => ({ name: project.name.value })),
    certifications: fields.certifications.map((item) => item.value),
  };
}
