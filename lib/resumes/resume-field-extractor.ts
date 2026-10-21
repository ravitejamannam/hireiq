import type { AiRunScope } from "@/lib/ai/ai-run";
import type { GatewaySubject } from "@/lib/ai/gateway";
import { runGuardedCompletion } from "@/lib/ai/guarded-completion";
import { getOpenAiApiKey } from "@/lib/ai/job-description-generator";
import { acceptResumeFields, repairResumeFieldShape, type ResumeFields } from "@/lib/resumes/resume-fields";
import { canonicalDegree } from "@/lib/resumes/degree-canonical";
import { canonicalEmployer } from "@/lib/resumes/employer-aliases";
import { mineResumeSpans } from "@/lib/resumes/resume-span-miner";
import { recordExtractionUsage } from "@/lib/resumes/extraction-meter";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";
import { isResumeSkillPhrase } from "@/lib/resumes/skill-phrase";
import { skillLabelTokens } from "@/lib/resumes/fixture-score";

const FIELD_CALL_BUDGET_MS = 30_000;
const FIELD_FAST_RETRY_MS = 20_000;

const FIELD_INSTRUCTIONS_SHORT = `Extract resume fields as JSON. Each value needs a quote copied from the resume. Use null when it is not written.
The credential is the degree, not the college. Extract every degree.
The title is the job held. The employer is the organization, not a client. Return every title. A date is not a title. A fresher with no job has an empty experience list.
Skills are short tool or method names, not sentences or traits.`;

const SECTION_KEEP = /^(work experience|professional experience|experience|employment|education|skills|technical skills|key skills|technical proficiency|projects?|certifications?)\b/i;
const SECTION_DROP = /^(summary|objective|career objective|hobbies|references|declaration|personal (?:details|information)|achievements)\b/i;

/** Header plus experience, education, and skills. Used when the full field call times out. */
export function relevantResumeSections(source: string) {
  const lines = source.split("\n");
  const kept: string[] = [];
  let keep = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_KEEP.test(trimmed)) keep = true;
    else if (SECTION_DROP.test(trimmed) && trimmed.length < 48) keep = false;
    if (keep) kept.push(line);
  }
  const text = `${lines.slice(0, 30).join("\n")}\n${kept.join("\n")}`.slice(0, 4_000);
  return text.trim().length > 200 ? text : source.slice(0, 4_000);
}

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
Treat B.Tech, BTech, and Bachelor of Technology as the degree. Do not put the college in the credential field. Extract every degree, not only the highest, including a diploma, ITI, 10th, and 12th when they are written. The credential is the degree or the major. The school name goes in the institution.

Skills are any ability written on the resume, in any line of work: software, civil, electrical, site, accounting, or a trade. Copy the skill words from the resume. Do not skip a skill because it is not a programming tool, and do not add a skill that is not written.
A skill must be a short noun phrase of at most five words naming a tool, method, trade, language, standard, or piece of equipment. Do not return a sentence, a job title, a personality trait, or a fragment.
Extract every skill in a list, inside a project description, and on either column of a two-column page. Do not stop after a few and do not summarize. A comma, slash, bullet, or new line separates skills. If a heading such as Languages, Tools, or Software comes before a colon, the skills are the words after the colon. Leave years of experience out of the value. Do not return a degree name as a skill.

Extract every employer listed, including earlier roles and roles without dates. A job may be a header such as "Associate consultant@SAP labs", a line such as "fresher job Accenture", a sentence such as "working at Acme", "Writer for Greymeter.com", or "worked as a designer in M/s. Acme", or an older block further down the page. A line like "Trainer-Finacle-Infosys" contains both the role and the employer. The employer is the organization. A client or a site is not the employer. A trailing dash is not part of the name. Do not stop after the most recent role. The title is the line above the company, the role under the person's name before the city, or the role words before the company in a hyphenated header. Return every title held at one employer, including an earlier title. A fresher with no job title has an empty experience list. Do not use the objective, the job being applied for, or a date as a title. When the title is inside a sentence, return the role words only.
Examples from real resumes:
"WORK EXPERIENCE
NIIT -
2016 to 2016"
The employer is NIIT. A company line that is only a name and a dash still counts.
"System engineer
Bengaluru, Karnataka"
The title is System engineer. It sits under the name, before the city.
"Global Production Support Lead, - Infosys Ltd (Technology Lead) - HSBC"
The title is Global Production Support Lead. The employer is Infosys Ltd. HSBC is the client.
"Was Online Content Writer for Greymeter.com"
The title is Online Content Writer. The employer is Greymeter.com.
"Technical Consultant
Oracle -
October 2015 to Present"
The title is Technical Consultant. The employer is Oracle.
"Imgeeyaul Ansari
java developer
Pune, Maharashtra - Email me on Indeed"
The title is java developer. It is the line under the name and above the city.
"WORK EXPERIENCE
Consultant
Neudesic (Vendor @ Microsoft)"
The title is Consultant. It is the line under WORK EXPERIENCE, above the employer.
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

const PRESENT = /^(present|current|now|till date|ongoing)$/i;

function monthIndex(value: string, asOf: Date, allowPresent: boolean): number | null {
  const trimmed = value.trim();
  if (allowPresent && PRESENT.test(trimmed)) return asOf.getFullYear() * 12 + asOf.getMonth();
  const named = trimmed.toLowerCase().match(/^([a-z]{3,9})\.?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.findIndex((name) => named[1].startsWith(name));
    if (month < 0) return null;
    return Number(named[2]) * 12 + month;
  }
  const year = trimmed.match(/^(19|20)\d{2}$/);
  if (year) return Number(year[0]) * 12;
  return null;
}

/** Months between two dates. "Present" uses `asOf`. Year-only dates count as January. */
export function tenureMonths(start: string, end: string, asOf = new Date()): number | null {
  const from = monthIndex(start, asOf, false);
  const to = monthIndex(end, asOf, true);
  if (from === null || to === null || to < from) return null;
  return to - from;
}

export type ExperienceSummary = {
  totalYears: number | null;
  currentTitle: string | null;
  currentOrganization: string | null;
};

/** Merge overlapping roles and report years, plus the role that is still open. */
export function summarizeExperience(
  roles: Array<{ title: string; organization?: string | null; startDate?: string | null; endDate?: string | null }>,
  asOf = new Date(),
): ExperienceSummary {
  const intervals: Array<[number, number]> = [];
  let current: { title: string; organization: string | null; end: number } | null = null;
  for (const role of roles) {
    const start = role.startDate ?? "";
    const end = role.endDate ?? "";
    if (!start || !end) continue;
    const from = monthIndex(start, asOf, false);
    const to = monthIndex(end, asOf, true);
    if (from === null || to === null || to < from) continue;
    intervals.push([from, to]);
    const open = PRESENT.test(end.trim());
    if (open && (!current || to >= current.end)) {
      current = { title: role.title, organization: role.organization ?? null, end: to };
    }
  }
  intervals.sort((left, right) => left[0] - right[0]);
  let total = 0;
  let cursor = -1;
  for (const [start, end] of intervals) {
    const from = Math.max(start, cursor);
    if (end > from) total += end - from;
    cursor = Math.max(cursor, end);
  }
  return {
    totalYears: intervals.length ? Math.round((total / 12) * 10) / 10 : null,
    currentTitle: current?.title ?? null,
    currentOrganization: current?.organization ?? null,
  };
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
    const range = following.match(
      /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*(?:to|–|—|-)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|present|current|till date|\d{4})\b/i,
    );
    experience.push({
      title,
      organization,
      startDate: range ? quoted(range[1], source) : null,
      endDate: range ? quoted(range[2], source) : null,
    });
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

  const mined = mineResumeSpans(source);
  for (const role of mined.roles) {
    if (experience.some((row) => row.title.value.toLowerCase() === role.title.toLowerCase())) continue;
    const title = quoted(role.title, source);
    if (!title) continue;
    experience.push({
      title,
      organization: role.organization ? quoted(role.organization, source) : null,
      startDate: role.startDate ? quoted(role.startDate, source) : null,
      endDate: role.endDate ? quoted(role.endDate, source) : null,
    });
  }
  for (const titleText of mined.titles) {
    if (experience.some((row) => row.title.value.toLowerCase() === titleText.toLowerCase())) continue;
    const title = quoted(titleText, source);
    if (!title) continue;
    const organizationText = mined.companies.find((company) => source.includes(company)) ?? null;
    experience.push({
      title,
      organization: organizationText ? quoted(organizationText, source) : null,
      startDate: null,
      endDate: null,
    });
    if (experience.length >= 20) break;
  }
  for (const company of mined.companies) {
    if (experience.some((row) => row.organization?.value.toLowerCase() === company.toLowerCase())) continue;
    const title = experience.find((row) => !row.organization)?.title;
    if (!title) continue;
    const organization = quoted(company, source);
    if (!organization) continue;
    const open = experience.find((row) => row.title === title && !row.organization);
    if (open) open.organization = organization;
  }
  for (const degree of mined.degrees) {
    const credential = quoted(degree, source);
    if (!credential) continue;
    if (education.some((row) => row.credential.value.toLowerCase() === credential.value.toLowerCase())) continue;
    education.push({ credential, institution: null });
    if (education.length >= 10) break;
  }
  for (const skill of mined.skills) {
    const field = quoted(skill, source);
    if (!field) continue;
    skills.push({ ...field, value: canonicalSkill(skill) });
    if (skills.length >= 40) break;
  }
  for (const name of mined.projects) {
    const field = quoted(name, source);
    if (!field) continue;
    if (projects.some((row) => row.name.value.toLowerCase() === field.value.toLowerCase())) continue;
    projects.push({ name: field });
    if (projects.length >= 20) break;
  }

  const accepted = acceptResumeFields(
    {
      fullName: nameLine ? quoted(nameLine, source) : null,
      email: email ? quoted(email, source) : null,
      phone: phone ? quoted(phone, source) : null,
      skills: dedupedQuoted(skills),
      experience: experience.slice(0, 20),
      education: education.slice(0, 10),
      certifications,
      projects: projects.slice(0, 20),
    },
    source,
  );
  return accepted.ok ? normalizeResumeFields(accepted.fields, source) : null;
}

function dedupedQuoted(fields: Array<{ value: string; quote: string }>) {
  const seen = new Set<string>();
  const out: Array<{ value: string; quote: string }> = [];
  for (const field of fields) {
    if (!isResumeSkillPhrase(field.value)) continue;
    const value = canonicalSkill(field.value);
    const key = value.toLowerCase();
    if (!isResumeSkillPhrase(value) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...field, value });
  }
  return out;
}

export type SkillEvidence = "skills-section" | "role-bullet" | "mention";

export type EvidencedSkill = { value: string; quote: string; evidence: SkillEvidence };

export const PRIMARY_SKILL_CAP = 15;

const SKILL_HEADING = /^(technical skills|key skills|core competencies|skills|it skills|software skills|tools|technical proficiency|technical summary|skill set)\b/i;
const INLINE_SKILL_HEADING = /^(languages|tools|databases|web technologies|operating systems|frameworks|middleware|programming languages)\s*:/i;
const EXPERIENCE_HEADING = /^(work experience|professional experience|experience|employment history|employment)\b/i;
const OTHER_HEADING = /^(education|projects?|certifications?|summary|objective|personal details|achievements)\b/i;

function sectionAt(source: string, needle: string): SkillEvidence | null {
  const probe = needle.trim().slice(0, 80);
  if (probe.length < 2) return null;
  let section: "skills" | "experience" | "other" = "other";
  let best: SkillEvidence | null = null;
  const strength: Record<SkillEvidence, number> = { "skills-section": 3, "role-bullet": 2, mention: 1 };
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (SKILL_HEADING.test(trimmed) || INLINE_SKILL_HEADING.test(trimmed)) section = "skills";
    else if (EXPERIENCE_HEADING.test(trimmed)) section = "experience";
    else if (OTHER_HEADING.test(trimmed)) section = "other";
    if (!line.includes(probe)) continue;
    const evidence: SkillEvidence = section === "skills" ? "skills-section" : section === "experience" ? "role-bullet" : "mention";
    if (!best || strength[evidence] > strength[best]) best = evidence;
  }
  return best;
}

function countMentions(source: string, value: string) {
  const needle = value.trim().toLowerCase();
  if (needle.length < 2) return 0;
  const hay = source.toLowerCase();
  let count = 0;
  let from = 0;
  while (from < hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function skillEvidence(value: string, quote: string, source: string): SkillEvidence {
  return sectionAt(source, quote) ?? sectionAt(source, value) ?? "mention";
}

/** Skills named in a Skills section outrank a role bullet, which outranks a single mention. */
export function rankResumeSkills(
  skills: Array<{ value: string; quote: string }>,
  source: string,
): { skills: EvidencedSkill[]; otherMentions: EvidencedSkill[] } {
  const ranked: EvidencedSkill[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    const value = canonicalSkill(skill.value);
    const key = value.toLowerCase();
    if (!key || seen.has(key) || !isResumeSkillPhrase(value)) continue;
    seen.add(key);
    ranked.push({ value, quote: skill.quote, evidence: skillEvidence(value, skill.quote, source) });
  }
  const order: Record<SkillEvidence, number> = { "skills-section": 0, "role-bullet": 1, mention: 2 };
  const listed = (skill: EvidencedSkill) => {
    const words = skill.value.trim().split(/\s+/).length;
    const quoteWords = skill.quote.trim().split(/\s+/).length;
    return (words <= 3 ? 2 : 0) + (quoteWords <= 8 ? 1 : 0);
  };
  ranked.sort(
    (left, right) =>
      order[left.evidence] - order[right.evidence] ||
      listed(right) - listed(left) ||
      countMentions(source, right.value) - countMentions(source, left.value),
  );
  const primary = ranked.filter((skill) => {
    if (skill.evidence === "skills-section") return true;
    if (skill.evidence === "role-bullet") return listed(skill) >= 3;
    return listed(skill) >= 3 && countMentions(source, skill.value) >= 2;
  }).slice(0, PRIMARY_SKILL_CAP);
  const primaryKeys = new Set(primary.map((skill) => skill.value.toLowerCase()));
  return {
    skills: primary,
    otherMentions: ranked.filter((skill) => !primaryKeys.has(skill.value.toLowerCase())),
  };
}

/** Split tools named inside a skill or project quote the model already grounded. */
function expandQuotedSkills(fields: ResumeFields, source: string): ResumeFields {
  const extra: Array<{ value: string; quote: string }> = [];
  const spans = fields.skills.map((skill) => skill.quote);
  for (const span of spans) {
    if (!span || !source.includes(span)) continue;
    for (const token of skillLabelTokens(span)) {
      if (!source.includes(token)) continue;
      extra.push({ value: token, quote: token });
    }
  }
  return { ...fields, skills: [...fields.skills, ...extra] };
}

const OBJECTIVE_LINE = /ứng tuyển|apply for|career objective|mục tiêu nghề nghiệp/i;

function heldTitle(title: string, quote: string, source: string) {
  if (DATE_LINE.test(title.trim())) return false;
  const hits = source.split("\n").filter((line) => line.includes(quote));
  if (hits.length > 0 && hits.every((line) => OBJECTIVE_LINE.test(line))) return false;
  return true;
}

function normalizeResumeFields(fields: ResumeFields, source: string): ResumeFields & {
  skills: EvidencedSkill[];
  otherMentions: EvidencedSkill[];
} {
  const ranked = rankResumeSkills(dedupedQuoted(fields.skills), source);
  return {
    ...fields,
    skills: ranked.skills,
    otherMentions: ranked.otherMentions,
    experience: fields.experience
      .filter((role) => heldTitle(role.title.value, role.title.quote, source))
      .map((role) => {
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

const SKILL_LIST_PROMPT = `List the tools, methods, trades, languages, standards, and equipment that the resume names as skills. Each skill is at most five words, with a quote copied from the resume. Return at most 30. Do not include job titles, degrees, personality traits, spoken languages, duty sentences, or a noun that only appears inside a task description.`;

const SKILL_LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["skills"],
  properties: { skills: { type: "array", items: { type: "object", additionalProperties: false, required: ["value", "quote"], properties: { value: { type: "string" }, quote: { type: "string" } } } } },
} as const;

async function listSkillsFromModel(
  source: string,
  key: string,
  model: string,
  guard?: ResumeFieldGuard,
): Promise<Array<{ value: string; quote: string }>> {
  try {
    const outcome = await runGuardedCompletion({
      optedOut: false,
      scope: guard?.scope,
      request: {
        subject: guard?.subject,
        feature: "resume_fields",
        model,
        promptVersion: "resume-skills-2",
        system: SKILL_LIST_PROMPT,
        user: source.slice(0, 12_000),
        schemaName: "resume_skill_list",
        schema: SKILL_LIST_SCHEMA,
        timeoutMs: FIELD_CALL_BUDGET_MS,
        maxRetries: 0,
        apiKey: key,
      },
    });
    if (outcome.result) {
      recordExtractionUsage({
        feature: "resume_fields",
        model: outcome.result.model,
        promptTokens: outcome.result.promptTokens ?? 0,
        completionTokens: outcome.result.completionTokens ?? 0,
      });
    }
    const parsed = outcome.result?.parsed as { skills?: Array<{ value?: string; quote?: string }> } | undefined;
    const skills = Array.isArray(parsed?.skills) ? parsed.skills : [];
    return skills.flatMap((skill) => {
      const value = typeof skill.value === "string" ? skill.value.trim() : "";
      const quote = typeof skill.quote === "string" ? skill.quote.trim() : "";
      if (!value || !quote || !source.includes(quote) || !isResumeSkillPhrase(value)) return [];
      return [{ value, quote }];
    }).slice(0, 30);
  } catch {
    return [];
  }
}

function dateRangeCount(text: string) {
  const matches = text.match(
    /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\s+(?:to|–|-)\s+(?:present|till date|current|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2})/gi,
  );
  return matches?.length ?? 0;
}

const ROLE_LIST_PROMPT = `List every job. A title may sit under the name before the city, on the line above a company, or before the company in a hyphenated header. A line that is only "NIIT -" is an employer. "Lead - Infosys Ltd - HSBC" means the employer is Infosys Ltd and HSBC is the client. "Writer for Greymeter.com" means the employer is Greymeter.com. Copy quotes from the resume.`;

const ROLE_LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["experience"],
  properties: {
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "organization"],
        properties: {
          title: {
            anyOf: [
              { type: "object", additionalProperties: false, required: ["value", "quote"], properties: { value: { type: "string" }, quote: { type: "string" } } },
              { type: "null" },
            ],
          },
          organization: {
            anyOf: [
              { type: "object", additionalProperties: false, required: ["value", "quote"], properties: { value: { type: "string" }, quote: { type: "string" } } },
              { type: "null" },
            ],
          },
        },
      },
    },
  },
} as const;

async function listRolesFromModel(
  source: string,
  key: string,
  model: string,
  guard?: ResumeFieldGuard,
): Promise<ResumeFields["experience"]> {
  try {
    const outcome = await runGuardedCompletion({
      optedOut: false,
      scope: guard?.scope,
      request: {
        subject: guard?.subject,
        feature: "resume_fields",
        model,
        promptVersion: "resume-roles-1",
        system: ROLE_LIST_PROMPT,
        user: source.slice(0, 12_000),
        schemaName: "resume_role_list",
        schema: ROLE_LIST_SCHEMA,
        timeoutMs: FIELD_CALL_BUDGET_MS,
        maxRetries: 0,
        apiKey: key,
      },
    });
    if (outcome.result) {
      recordExtractionUsage({
        feature: "resume_fields",
        model: outcome.result.model,
        promptTokens: outcome.result.promptTokens ?? 0,
        completionTokens: outcome.result.completionTokens ?? 0,
      });
    }
    const parsed = outcome.result?.parsed as {
      experience?: Array<{ title?: { value?: string; quote?: string } | null; organization?: { value?: string; quote?: string } | null }>;
    };
    const roles = Array.isArray(parsed?.experience) ? parsed.experience : [];
    return roles.flatMap((role) => {
      const titleValue = role.title?.value?.trim() ?? "";
      const titleQuote = role.title?.quote?.trim() ?? "";
      const orgValue = role.organization?.value?.trim() ?? "";
      const orgQuote = role.organization?.quote?.trim() ?? "";
      const titleOk = Boolean(titleValue && titleQuote && source.includes(titleQuote));
      const orgOk = Boolean(orgValue && orgQuote && source.includes(orgQuote));
      if (!titleOk && !orgOk) return [];
      return [
        {
          title: titleOk ? { value: titleValue, quote: titleQuote } : { value: orgValue, quote: orgQuote },
          organization: orgOk ? { value: orgValue, quote: orgQuote } : null,
          startDate: null,
          endDate: null,
        },
      ];
    });
  } catch {
    return [];
  }
}

function acceptableTitleLine(line: string) {
  const text = line.trim();
  if (text.length < 2 || text.length > 70) return false;
  if (/[.!?]$/.test(text)) return false;
  if (/email me on indeed|indeed\.com|willing to relocate/i.test(text)) return false;
  return text.split(/\s+/).length <= 10;
}

function blankBack(lines: string[], index: number) {
  let cursor = index;
  while (cursor >= 0 && !lines[cursor]?.trim()) cursor -= 1;
  return cursor;
}

/** Title under the name, or the first line under WORK EXPERIENCE. Quotes are those lines. */
export function rolesFromResumeHeadings(source: string): ResumeFields["experience"] {
  const lines = source.split("\n");
  const roles: ResumeFields["experience"] = [];
  const push = (titleLine: string, orgLine?: string) => {
    const split = titleLine.split(/\s+-\s+/);
    const title = (split[0] ?? "").trim();
    const inlineOrg = split.slice(1).join(" - ").trim();
    if (!acceptableTitleLine(title) || !source.includes(title)) return;
    const org = (inlineOrg || orgLine || "").replace(/\s+-\s+.*$/, "").replace(/\s*-\s*$/, "").trim();
    roles.push({
      title: { value: title, quote: title },
      organization: org && source.includes(org) ? { value: org, quote: org } : null,
      startDate: null,
      endDate: null,
    });
  };
  for (let index = 0; index < lines.length; index += 1) {
    if (!/email me on indeed/i.test(lines[index] ?? "")) continue;
    let cursor = blankBack(lines, index - 1);
    if (cursor < 0) continue;
    const maybeCity = lines[cursor]?.trim() ?? "";
    if (/,/.test(maybeCity) || maybeCity === "-" || /^-\s/.test(maybeCity)) {
      cursor = blankBack(lines, cursor - 1);
    }
    if (cursor >= 0) push(lines[cursor]?.trim() ?? "");
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^(work experience|professional experience|kinh nghiệm làm việc|quá trình công tác)$/i.test(lines[index]?.trim() ?? "")) continue;
    let titleAt = index + 1;
    while (titleAt < lines.length && (!lines[titleAt]?.trim() || DATE_LINE.test(lines[titleAt]?.trim() ?? ""))) titleAt += 1;
    if (titleAt >= lines.length) continue;
    const titleLine = lines[titleAt]?.trim() ?? "";
    if (!acceptableTitleLine(titleLine)) continue;
    let orgAt = titleAt + 1;
    while (orgAt < lines.length && !lines[orgAt]?.trim()) orgAt += 1;
    const orgLine = lines[orgAt]?.trim() ?? "";
    const orgOk = orgLine && orgLine.length <= 60 && !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|education)\b/i.test(orgLine);
    push(titleLine, orgOk ? orgLine : undefined);
  }
  return roles;
}

function employersBesideTitles(
  roles: ResumeFields["experience"],
  source: string,
): ResumeFields["experience"] {
  return roles.map((role) => {
    if (role.organization) return role;
    const match = role.title.quote.match(/[-–]\s*([A-Z][A-Za-z0-9.& ]{2,48}?)(?:\s*[-–,(]|$)/);
    const name = match?.[1]?.trim().replace(/\s*[-–]+\s*$/, "");
    if (!name || name.length < 3 || !source.includes(name)) return role;
    return { ...role, organization: { value: name, quote: name } };
  });
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
  /** Whose resume this is. The gateway re-checks it; a call without one is refused. */
  subject?: GatewaySubject;
};

export type ResumeModelFailure =
  | "NO_API_KEY"
  | "EMPTY_RESPONSE"
  | "INVALID_SHAPE"
  | "UNGROUNDED_QUOTE"
  | "TIMEOUT"
  | "MODEL_ERROR";

export type ResumePassTimings = {
  fieldsMs: number;
  skillsMs: number;
  rolesMs: number;
  rolesSkipped: boolean;
  wallMs: number;
};

async function fieldsFromModel(
  source: string,
  guard?: ResumeFieldGuard,
): Promise<{ ok: true; fields: ResumeFields & { skills: EvidencedSkill[]; otherMentions: EvidencedSkill[] }; timings: ResumePassTimings } | { ok: false; reason: ResumeModelFailure; timings: ResumePassTimings | null }> {
  if (guard?.optedOut) return { ok: false, reason: "NO_API_KEY", timings: null };
  const key = getOpenAiApiKey();
  if (!key) return { ok: false, reason: "NO_API_KEY", timings: null };
  const model = process.env.OPENAI_RESUME_FIELDS_MODEL?.trim() || "gpt-4o-mini";
  const wallStarted = performance.now();
  const skillsStarted = performance.now();
  const skillsTask = listSkillsFromModel(source, key, model, guard).then((skills) => ({
    skills,
    skillsMs: performance.now() - skillsStarted,
  }));
  let lastFailure: ResumeModelFailure = "MODEL_ERROR";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fast = attempt === 1;
      const fieldsStarted = performance.now();
      const outcome = await runGuardedCompletion({
        optedOut: false,
        scope: guard?.scope,
        request: {
          subject: guard?.subject,
          feature: "resume_fields",
          model,
          promptVersion: fast ? "resume-fields-10-fast" : "resume-fields-10",
          system: fast ? FIELD_INSTRUCTIONS_SHORT : FIELD_INSTRUCTIONS,
          user: fast ? relevantResumeSections(source) : source.slice(0, 12_000),
          schemaName: "resume_fields",
          schema: RESUME_FIELDS_SCHEMA,
          timeoutMs: fast ? FIELD_FAST_RETRY_MS : FIELD_CALL_BUDGET_MS,
          maxRetries: 0,
          apiKey: key,
        },
      });
      const fieldsMs = performance.now() - fieldsStarted;
      const result = outcome.result;
      if (result) {
        recordExtractionUsage({
          feature: "resume_fields",
          model: result.model,
          promptTokens: result.promptTokens ?? 0,
          completionTokens: result.completionTokens ?? 0,
        });
      }
      if (!result?.parsed) {
        lastFailure = "EMPTY_RESPONSE";
        continue;
      }
      let accepted = acceptResumeFields(result.parsed, source);
      if (!accepted.ok && accepted.reason === "INVALID_SHAPE") {
        console.info(
          JSON.stringify({
            event: "resume_fields_invalid_shape",
            attempt,
            raw: JSON.stringify(result.parsed).slice(0, 2000),
          }),
        );
        accepted = acceptResumeFields(repairResumeFieldShape(result.parsed), source);
      }
      if (!accepted.ok) return { ok: false, reason: accepted.reason, timings: null };
      let experience = [
        ...employersBesideTitles(accepted.fields.experience, source),
        ...rolesFromResumeHeadings(source),
      ];
      const rolesSkipped = !needsRolePass(experience, source);
      const rolesTask = (async () => {
        if (rolesSkipped) return { roles: [] as ResumeFields["experience"], rolesMs: 0 };
        const started = performance.now();
        const roles = await listRolesFromModel(source, key, model, guard);
        return { roles, rolesMs: performance.now() - started };
      })();
      const [listed, extraRoles] = await Promise.all([skillsTask, rolesTask]);
      if (!rolesSkipped) {
        const seen = new Set(experience.map((role) => role.title.quote.toLowerCase()));
        experience = [
          ...experience,
          ...extraRoles.roles.filter((role) => !seen.has(role.title.quote.toLowerCase())),
        ];
      }
      const merged = {
        ...accepted.fields,
        skills: [...accepted.fields.skills, ...listed.skills],
        experience,
      };
      return {
        ok: true,
        fields: normalizeResumeFields(expandQuotedSkills(merged, source), source),
        timings: {
          fieldsMs: Math.round(fieldsMs),
          skillsMs: Math.round(listed.skillsMs),
          rolesMs: Math.round(extraRoles.rolesMs),
          rolesSkipped,
          wallMs: Math.round(performance.now() - wallStarted),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const timedOut = /timeout|aborted|abort/i.test(message);
      lastFailure = timedOut ? "TIMEOUT" : "MODEL_ERROR";
      if (attempt === 0 && timedOut) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return { ok: false, reason: lastFailure, timings: null };
    }
  }
  return { ok: false, reason: lastFailure, timings: null };
}

function needsRolePass(experience: ResumeFields["experience"], source: string) {
  if (experience.length === 0) return dateRangeCount(source) > 0;
  return experience.some((role) => !role.title?.value || !role.organization?.value);
}

export type ResumeFieldSource = "model" | "unreviewed";

const EMPTY_FIELDS: ResumeFields = {
  fullName: null,
  email: null,
  phone: null,
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  projects: [],
};

export async function proposeResumeFieldsDetailed(
  source: string,
  guard?: ResumeFieldGuard,
): Promise<{
  fields: ResumeFields & { skills: EvidencedSkill[]; otherMentions: EvidencedSkill[] };
  source: ResumeFieldSource;
  modelFailure: ResumeModelFailure | null;
  timings: ResumePassTimings | null;
}> {
  if (guard?.optedOut) {
    return { fields: { ...EMPTY_FIELDS, skills: [], otherMentions: [] }, source: "unreviewed", modelFailure: "NO_API_KEY", timings: null };
  }
  const modelled = await fieldsFromModel(source, guard);
  if (modelled.ok) return { fields: modelled.fields, source: "model", modelFailure: null, timings: modelled.timings };
  return { fields: { ...EMPTY_FIELDS, skills: [], otherMentions: [] }, source: "unreviewed", modelFailure: modelled.reason, timings: modelled.timings };
}

export async function proposeResumeFields(
  source: string,
  guard?: ResumeFieldGuard,
): Promise<ResumeFields | null> {
  return (await proposeResumeFieldsDetailed(source, guard)).fields;
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
  /** Skills that were only mentioned, kept out of the primary list. */
  otherMentions: string[];
  totalExperienceYears: number | null;
  currentRole: string | null;
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

export function suggestionFromFields(
  fields: ResumeFields & { otherMentions?: Array<{ value: string }> },
): ResumeFormSuggestion {
  const experiences = fields.experience.map((role) => {
    const startDate = role.startDate?.value ?? "";
    const endDate = role.endDate?.value ?? "";
    return {
      title: role.title.value,
      company: role.organization?.value ?? "",
      startDate,
      endDate,
      tenure: startDate && endDate ? tenureLabel(startDate, endDate) : "",
    };
  });
  const summary = summarizeExperience(experiences);
  const currentRole = summary.currentTitle
    ? [summary.currentTitle, summary.currentOrganization].filter(Boolean).join(" at ")
    : null;
  return {
    fullName: fields.fullName?.value ?? null,
    email: fields.email?.value ?? null,
    phone: fields.phone?.value ?? null,
    skills: fields.skills.map((skill) => skill.value),
    otherMentions: fields.otherMentions?.map((skill) => skill.value) ?? [],
    experiences,
    education: fields.education.map((school) => ({
      credential: school.credential.value,
      institution: school.institution?.value ?? "",
    })),
    projects: fields.projects.map((project) => ({ name: project.name.value })),
    certifications: fields.certifications.map((item) => item.value),
    totalExperienceYears: summary.totalYears,
    currentRole,
  };
}
