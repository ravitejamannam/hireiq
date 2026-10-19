import { z } from "zod";

/**
 * Fixed shape for an LLM that turns resume text into fields.
 * Extra keys are rejected. Each value must quote a span that actually
 * appears in the source text. Tenure is computed later from the dates,
 * so it is not a field the model can invent.
 */

const quoted = z
  .object({
    value: z.string().trim().min(1).max(200),
    quote: z.string().trim().min(1).max(500),
  })
  .strict();

const role = z
  .object({
    title: quoted,
    organization: quoted.nullable(),
    startDate: quoted.nullable(),
    endDate: quoted.nullable(),
  })
  .strict();

const school = z
  .object({
    credential: quoted,
    institution: quoted.nullable(),
  })
  .strict();

const project = z
  .object({
    name: quoted,
  })
  .strict();

export const resumeFieldsSchema = z
  .object({
    fullName: quoted.nullable(),
    email: quoted.nullable(),
    phone: quoted.nullable(),
    skills: z.array(quoted).max(40),
    experience: z.array(role).max(20),
    education: z.array(school).max(10),
    certifications: z.array(quoted).max(20),
    projects: z.array(project).max(20),
  })
  .strict();

export type ResumeFields = z.infer<typeof resumeFieldsSchema>;

export type ResumeFieldRejection = {
  ok: false;
  reason: "INVALID_SHAPE" | "UNGROUNDED_QUOTE";
};

function asQuoted(value: unknown): { value: string; quote: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = typeof record.value === "string" ? record.value.trim() : "";
  const quote = typeof record.quote === "string" ? record.quote.trim() : "";
  if (!text || !quote || text.length > 200 || quote.length > 500) return null;
  return { value: text, quote };
}

function asQuotedList(value: unknown): Array<{ value: string; quote: string }> {
  if (!Array.isArray(value)) return [];
  return value.map(asQuoted).filter((item): item is { value: string; quote: string } => item !== null);
}

/** Empty date strings fail the schema and used to discard the whole resume. */
function sanitizeResumeFields(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  const experience = Array.isArray(record.experience)
    ? record.experience.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const role = item as Record<string, unknown>;
        const title = asQuoted(role.title);
        if (!title) return [];
        return [
          {
            title,
            organization: asQuoted(role.organization),
            startDate: asQuoted(role.startDate),
            endDate: asQuoted(role.endDate),
          },
        ];
      })
    : [];
  const education = Array.isArray(record.education)
    ? record.education.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const school = item as Record<string, unknown>;
        const credential = asQuoted(school.credential);
        if (!credential) return [];
        return [{ credential, institution: asQuoted(school.institution) }];
      })
    : [];
  const projects = Array.isArray(record.projects)
    ? record.projects.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const project = item as Record<string, unknown>;
        const name = asQuoted(project.name);
        return name ? [{ name }] : [];
      })
    : [];
  return {
    fullName: asQuoted(record.fullName),
    email: asQuoted(record.email),
    phone: asQuoted(record.phone),
    skills: asQuotedList(record.skills),
    experience,
    education,
    certifications: asQuotedList(record.certifications),
    projects,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexToken(part: string) {
  return escapeRegExp(part).replace(/["“”]/g, "[\"“”]").replace(/['‘’]/g, "['‘’]");
}

/** Exact span, or the same words with different line breaks, repeated spaces, or curly quotes. */
export function locateResumeQuote(source: string, quote: string): string | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;
  if (source.includes(trimmed)) return trimmed;
  const parts = trimmed.replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return null;
  const match = source.match(new RegExp(parts.map(flexToken).join("\\s+")));
  return match?.[0] ?? null;
}

function groundQuoted(
  field: { value: string; quote: string } | null,
  source: string,
): { value: string; quote: string } | null {
  if (!field) return null;
  const span = locateResumeQuote(source, field.quote);
  if (!span) return null;
  const foldedSpan = span.replace(/\s+/g, " ").trim().toLowerCase();
  const foldedValue = field.value.replace(/\s+/g, " ").trim().toLowerCase();
  const value = foldedValue && foldedSpan.includes(foldedValue) ? field.value.trim() : span.replace(/\s+/g, " ").trim();
  if (!value || value.length > 200) return null;
  return { value, quote: span };
}

function groundFields(fields: ResumeFields, source: string): ResumeFields {
  return {
    fullName: groundQuoted(fields.fullName, source),
    email: groundQuoted(fields.email, source),
    phone: groundQuoted(fields.phone, source),
    skills: fields.skills.flatMap((skill) => {
      const grounded = groundQuoted(skill, source);
      return grounded ? [grounded] : [];
    }),
    experience: fields.experience.flatMap((role) => {
      const title = groundQuoted(role.title, source);
      if (!title) return [];
      return [
        {
          title,
          organization: groundQuoted(role.organization, source),
          startDate: groundQuoted(role.startDate, source),
          endDate: groundQuoted(role.endDate, source),
        },
      ];
    }),
    education: fields.education.flatMap((school) => {
      const credential = groundQuoted(school.credential, source);
      if (!credential) return [];
      return [{ credential, institution: groundQuoted(school.institution, source) }];
    }),
    certifications: fields.certifications.flatMap((item) => {
      const grounded = groundQuoted(item, source);
      return grounded ? [grounded] : [];
    }),
    projects: fields.projects.flatMap((project) => {
      const name = groundQuoted(project.name, source);
      return name ? [{ name }] : [];
    }),
  };
}

function quotesOf(fields: ResumeFields): string[] {
  const quotes: string[] = [];
  const take = (field: { quote: string } | null | undefined) => {
    if (field) quotes.push(field.quote);
  };
  take(fields.fullName);
  take(fields.email);
  take(fields.phone);
  for (const skill of fields.skills) quotes.push(skill.quote);
  for (const role of fields.experience) {
    quotes.push(role.title.quote);
    take(role.organization);
    take(role.startDate);
    take(role.endDate);
  }
  for (const school of fields.education) {
    quotes.push(school.credential.quote);
    take(school.institution);
  }
  for (const certification of fields.certifications) quotes.push(certification.quote);
  for (const project of fields.projects) quotes.push(project.name.quote);
  return quotes;
}

export function acceptResumeFields(
  raw: unknown,
  sourceText: string,
): { ok: true; fields: ResumeFields } | ResumeFieldRejection {
  const direct = resumeFieldsSchema.safeParse(raw);
  let data: ResumeFields;
  if (direct.success) {
    data = direct.data;
  } else {
    const codes = new Set(direct.error.issues.map((issue) => issue.code));
    const repairable = [...codes].every((code) => code === "too_small" || code === "too_big");
    if (!repairable) return { ok: false, reason: "INVALID_SHAPE" };
    const repaired = resumeFieldsSchema.safeParse(sanitizeResumeFields(raw));
    if (!repaired.success) return { ok: false, reason: "INVALID_SHAPE" };
    data = repaired.data;
  }
  const fields = groundFields(data, sourceText);
  const kept = fields.skills.length + fields.experience.length + fields.education.length;
  const offered = data.skills.length + data.experience.length + data.education.length;
  if (kept === 0 && (offered > 0 || quotesOf(data).some((quote) => !locateResumeQuote(sourceText, quote)))) {
    return { ok: false, reason: "UNGROUNDED_QUOTE" };
  }
  return { ok: true, fields };
}
