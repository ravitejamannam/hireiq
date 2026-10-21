export const IMPORT_FIELDS = [
  "name",
  "email",
  "phone",
  "currentEmployer",
  "currentTitle",
  "experience",
  "externalCandidateId",
  "source",
  "sourceJobId",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ImportMapping = Partial<Record<ImportField, string>>;

const ALIASES: Record<ImportField, string[]> = {
  name: ["name", "full name", "candidate name", "applicant name"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "mobile", "phone number"],
  currentEmployer: ["current employer", "current company", "employer"],
  currentTitle: ["current title", "current role", "designation"],
  experience: ["experience", "experience years", "years of experience"],
  externalCandidateId: ["candidate id", "external id", "applicant id"],
  source: ["source", "channel"],
  sourceJobId: ["job id", "job code", "requisition"],
};

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Suggests a mapping only when a header matches one known alias exactly.
 * A header that could mean two fields is left unmapped.
 */
export function suggestMapping(headers: string[]): {
  suggestions: ImportMapping;
  ambiguousHeaders: string[];
} {
  const suggestions: ImportMapping = {};
  const ambiguousHeaders: string[] = [];
  const usedFields = new Set<ImportField>();

  for (const header of headers) {
    const key = normalizeHeader(header);
    const fields = IMPORT_FIELDS.filter((field) => ALIASES[field].includes(key));
    if (fields.length > 1) {
      ambiguousHeaders.push(header);
      continue;
    }
    const field = fields[0];
    if (!field || usedFields.has(field)) continue;
    suggestions[field] = header;
    usedFields.add(field);
  }

  return { suggestions, ambiguousHeaders };
}

export function mappingFromTemplate(value: unknown): ImportMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mapping: ImportMapping = {};
  for (const field of IMPORT_FIELDS) {
    const header = (value as Record<string, unknown>)[field];
    if (header == null || header === "") continue;
    if (typeof header !== "string" || !header.trim()) return null;
    mapping[field] = header.trim();
  }
  return mapping;
}

export const BUILT_IN_TEMPLATES: Array<{ id: string; name: string; mapping: ImportMapping }> = [
  {
    id: "generic-csv",
    name: "Generic CSV",
    mapping: {
      name: "Full name",
      email: "Email",
      phone: "Phone",
      currentEmployer: "Current employer",
      currentTitle: "Current title",
      experience: "Experience years",
    },
  },
  {
    id: "generic-xlsx",
    name: "Generic XLSX",
    mapping: {
      name: "Full name",
      email: "Email",
      phone: "Phone",
      currentEmployer: "Current employer",
      currentTitle: "Current title",
      experience: "Experience years",
    },
  },
];

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return "invalid" as const;
  return email;
}

/** Digit comparison only. This is not E.164 validation. */
export function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
