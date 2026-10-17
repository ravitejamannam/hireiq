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
  const parsed = resumeFieldsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID_SHAPE" };
  const grounded = quotesOf(parsed.data).every((quote) => sourceText.includes(quote));
  if (!grounded) return { ok: false, reason: "UNGROUNDED_QUOTE" };
  return { ok: true, fields: parsed.data };
}
