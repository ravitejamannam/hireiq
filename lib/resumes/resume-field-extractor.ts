import { getOpenAiApiKey } from "@/lib/ai/job-description-generator";
import { acceptResumeFields, type ResumeFields } from "@/lib/resumes/resume-fields";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";

const FIELD_INSTRUCTIONS = `Extract resume fields as JSON. Use null when a value is not written in the resume.
Every value must include a quote copied exactly from the resume. Do not add keys.
Shape:
{"fullName":{"value":"","quote":""}|null,"email":{"value":"","quote":""}|null,"phone":{"value":"","quote":""}|null,"skills":[{"value":"","quote":""}],"experience":[{"title":{"value":"","quote":""},"organization":{"value":"","quote":""}|null,"startDate":{"value":"","quote":""}|null,"endDate":{"value":"","quote":""}|null}],"education":[{"credential":{"value":"","quote":""},"institution":{"value":"","quote":""}|null}],"certifications":[{"value":"","quote":""}],"projects":[{"name":{"value":"","quote":""}}]}`;

function quoted(value: string, source: string): { value: string; quote: string } | null {
  const trimmed = value.trim();
  if (!trimmed || !source.includes(trimmed)) return null;
  return { value: trimmed, quote: trimmed };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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
    return [{ title, organization, startDate, endDate }];
  });
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
  return accepted.ok ? accepted.fields : null;
}

async function fieldsFromModel(source: string): Promise<ResumeFields | null> {
  const key = getOpenAiApiKey();
  if (!key) return null;
  const model = process.env.OPENAI_RESUME_FIELDS_MODEL?.trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: FIELD_INSTRUCTIONS },
          { role: "user", content: source.slice(0, 12_000) },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const accepted = acceptResumeFields(JSON.parse(content), source);
    if (!accepted.ok) return null;
    return {
      ...accepted.fields,
      skills: accepted.fields.skills.map((skill) => ({
        ...skill,
        value: canonicalSkill(skill.value),
      })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function proposeResumeFields(source: string): Promise<ResumeFields | null> {
  return (await fieldsFromModel(source)) ?? heuristicResumeFields(source);
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
