/**
 * Canonical job-board posting view.
 *
 * Turns a requirement (scalars + optional structuredPayload) into the
 * sections a hiring board shows: overview, about the role, responsibilities,
 * requirements, skills, benefits, about the company.
 *
 * Not matching. Not ranking. Not identity.
 */

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "CONTRACT",
  "PART_TIME",
  "INTERNSHIP",
] as const;

export const SENIORITY_LEVELS = [
  "JUNIOR",
  "INTERMEDIATE",
  "SENIOR",
  "STAFF",
  "PRINCIPAL",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const employmentTypeLabels: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  CONTRACT: "Contract",
  PART_TIME: "Part-time",
  INTERNSHIP: "Internship",
};

export const seniorityLevelLabels: Record<SeniorityLevel, string> = {
  JUNIOR: "Junior",
  INTERMEDIATE: "Intermediate",
  SENIOR: "Senior",
  STAFF: "Staff",
  PRINCIPAL: "Principal",
};

export const POSTING_PAYLOAD_VERSION = 2;

export type JobPostingNarrative = {
  schemaVersion: typeof POSTING_PAYLOAD_VERSION;
  employmentType: EmploymentType;
  seniorityLevel: SeniorityLevel;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  aboutCompany: string | null;
};

export type JobPostingView = {
  title: string;
  companyName: string;
  location: string | null;
  employmentType: EmploymentType;
  employmentTypeLabel: string;
  seniorityLevel: SeniorityLevel;
  seniorityLevelLabel: string;
  openings: string;
  salary: string;
  postedLabel: string;
  aboutRole: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  skills: string[];
  benefits: string[];
  aboutCompany: string;
  industry: string | null;
  companySize: string | null;
};

export type JobPostingSource = {
  title: string;
  companyName: string;
  companyIndustry?: string | null;
  companyEmployees?: number | null;
  location: string | null;
  experienceRange: string | null;
  numberOfPositions: number | null;
  compensationRange: string | null;
  jobDescription: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  primarySkills: string | null;
  createdAt?: Date | string | null;
  structuredPayload?: unknown;
};

export function bulletsFromText(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/\r?\n|(?<=;)\s+|(?<=\.)\s+(?=[A-Z•\-\d])/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")
        .replace(/;+\s*$/, "")
        .trim(),
    )
    .filter((line) => line.length > 2);
}

export function skillsFromText(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(/[,/|]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function displayJobTitle(title: string, companyName: string) {
  const prefix = `${companyName}: `;
  if (title.startsWith(prefix)) return title.slice(prefix.length);
  return title;
}

export function inferEmploymentType(source: JobPostingSource): EmploymentType {
  const haystack = `${source.title} ${source.location ?? ""}`.toLowerCase();
  if (/\bintern/.test(haystack)) return "INTERNSHIP";
  if (/\bcontract|consultant|freelance/.test(haystack)) return "CONTRACT";
  if (/\bpart[-\s]?time/.test(haystack)) return "PART_TIME";
  return "FULL_TIME";
}

export function inferSeniorityLevel(source: JobPostingSource): SeniorityLevel {
  const haystack = `${source.title} ${source.experienceRange ?? ""}`.toLowerCase();
  if (/\bprincipal|distinguished/.test(haystack)) return "PRINCIPAL";
  if (/\bstaff|8\+|10\+/.test(haystack)) return "STAFF";
  if (/\bsenior|lead|5\+|5-/.test(haystack)) return "SENIOR";
  if (/\bjunior|intern|0-|1-2|1 to 2/.test(haystack)) return "JUNIOR";
  if (/\b2-|3-|4-|intermediate/.test(haystack)) return "INTERMEDIATE";
  return "INTERMEDIATE";
}

export function parseJobPostingNarrative(
  value: unknown,
): JobPostingNarrative | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== POSTING_PAYLOAD_VERSION) return null;
  if (
    typeof record.employmentType !== "string" ||
    !EMPLOYMENT_TYPES.includes(record.employmentType as EmploymentType)
  ) {
    return null;
  }
  if (
    typeof record.seniorityLevel !== "string" ||
    !SENIORITY_LEVELS.includes(record.seniorityLevel as SeniorityLevel)
  ) {
    return null;
  }
  return {
    schemaVersion: POSTING_PAYLOAD_VERSION,
    employmentType: record.employmentType as EmploymentType,
    seniorityLevel: record.seniorityLevel as SeniorityLevel,
    responsibilities: asStringList(record.responsibilities),
    requirements: asStringList(record.requirements),
    benefits: asStringList(record.benefits),
    aboutCompany:
      typeof record.aboutCompany === "string" && record.aboutCompany.trim()
        ? record.aboutCompany.trim()
        : null,
  };
}

export function narrativeFromFormInput(input: {
  employmentType?: unknown;
  seniorityLevel?: unknown;
  responsibilities?: unknown;
  requirements?: unknown;
  benefits?: unknown;
  aboutCompany?: unknown;
}): JobPostingNarrative | null {
  const employmentType = coerceEmploymentType(input.employmentType);
  const seniorityLevel = coerceSeniorityLevel(input.seniorityLevel);
  const responsibilities = linesFromUnknown(input.responsibilities);
  const requirements = linesFromUnknown(input.requirements);
  const benefits = linesFromUnknown(input.benefits);
  const aboutCompany =
    typeof input.aboutCompany === "string" && input.aboutCompany.trim()
      ? input.aboutCompany.trim()
      : null;

  if (
    !employmentType &&
    !seniorityLevel &&
    responsibilities.length === 0 &&
    requirements.length === 0 &&
    benefits.length === 0 &&
    !aboutCompany
  ) {
    return null;
  }

  return {
    schemaVersion: POSTING_PAYLOAD_VERSION,
    employmentType: employmentType ?? "FULL_TIME",
    seniorityLevel: seniorityLevel ?? "INTERMEDIATE",
    responsibilities,
    requirements,
    benefits,
    aboutCompany,
  };
}

export function resolveJobPostingView(
  source: JobPostingSource,
  postedLabel: string,
): JobPostingView {
  const narrative = parseJobPostingNarrative(source.structuredPayload);
  const employmentType =
    narrative?.employmentType ?? inferEmploymentType(source);
  const seniorityLevel =
    narrative?.seniorityLevel ?? inferSeniorityLevel(source);
  const skills = skillsFromText(source.primarySkills);
  const aboutRole =
    source.jobDescription?.trim() ||
    defaultAboutRole(source, employmentType, seniorityLevel);
  const responsibilities =
    narrative?.responsibilities.length
      ? narrative.responsibilities
      : defaultResponsibilities(source);
  const requirements =
    narrative?.requirements.length
      ? narrative.requirements
      : bulletsFromText(source.mustHaveRequirements).length > 0
        ? bulletsFromText(source.mustHaveRequirements)
        : defaultRequirements(source, seniorityLevel);
  const niceToHave = bulletsFromText(source.niceToHaveRequirements);
  const benefits =
    narrative?.benefits.length ? narrative.benefits : defaultBenefits(source);
  const aboutCompany =
    narrative?.aboutCompany || defaultAboutCompany(source);

  const openings = source.numberOfPositions
    ? `${source.numberOfPositions} opening${
        source.numberOfPositions === 1 ? "" : "s"
      }`
    : "Open";

  return {
    title: displayJobTitle(source.title, source.companyName),
    companyName: source.companyName,
    location: source.location,
    employmentType,
    employmentTypeLabel: employmentTypeLabels[employmentType],
    seniorityLevel,
    seniorityLevelLabel: seniorityLevelLabels[seniorityLevel],
    openings,
    salary: source.compensationRange?.trim() || "Not published",
    postedLabel,
    aboutRole,
    responsibilities,
    requirements,
    niceToHave,
    skills,
    benefits,
    aboutCompany,
    industry: source.companyIndustry?.trim() || null,
    companySize: source.companyEmployees
      ? `~${source.companyEmployees} people`
      : null,
  };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function linesFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return bulletsFromText(value);
  return asStringList(value);
}

function coerceEmploymentType(value: unknown): EmploymentType | null {
  if (typeof value !== "string") return null;
  return EMPLOYMENT_TYPES.includes(value as EmploymentType)
    ? (value as EmploymentType)
    : null;
}

function coerceSeniorityLevel(value: unknown): SeniorityLevel | null {
  if (typeof value !== "string") return null;
  return SENIORITY_LEVELS.includes(value as SeniorityLevel)
    ? (value as SeniorityLevel)
    : null;
}

function defaultAboutRole(
  source: JobPostingSource,
  employmentType: EmploymentType,
  seniorityLevel: SeniorityLevel,
) {
  const role = displayJobTitle(source.title, source.companyName);
  const where = source.location ? ` in ${source.location}` : "";
  return `${source.companyName} is hiring a ${seniorityLevelLabels[seniorityLevel].toLowerCase()} ${role}${where}. This is a ${employmentTypeLabels[employmentType].toLowerCase()} role: you will own real product work, ship with a small team, and be evaluated on evidence — a skills assessment and an expert interview — not a résumé keyword match.`;
}

function defaultResponsibilities(source: JobPostingSource) {
  const role = displayJobTitle(source.title, source.companyName).toLowerCase();
  return [
    `Own features end-to-end as a ${role}: spec, build, ship, and follow them in production.`,
    "Design clear interfaces — APIs, data, and the workflows people actually use.",
    "Work directly with the hiring team and founders; there is no extra layer between you and the problem.",
    "Raise the quality bar: reviews, instrumentation, and deleting work that does not earn its keep.",
    source.location?.toLowerCase().includes("remote")
      ? "Collaborate asynchronously with written specs, tight feedback loops, and honest status."
      : "Stay close to the team on-site: pairing, design reviews, and fast decisions.",
  ];
}

function defaultRequirements(
  source: JobPostingSource,
  seniorityLevel: SeniorityLevel,
) {
  const experience = source.experienceRange
    ? `${source.experienceRange} of relevant experience.`
    : `${seniorityLevelLabels[seniorityLevel]} experience shipping production work.`;
  const skills = skillsFromText(source.primarySkills);
  return [
    experience,
    "Strong fundamentals and taste: you sweat edge cases, empty states, and failure modes.",
    skills.length > 0
      ? `Hands-on with ${skills.slice(0, 4).join(", ")}.`
      : "Hands-on with the stack this team already runs in production.",
    "High agency, clear writing, and a bias to ship.",
    source.location
      ? `Based in ${source.location}, or willing to work to that arrangement.`
      : "Able to overlap working hours with the hiring team.",
  ];
}

function defaultBenefits(source: JobPostingSource) {
  const benefits = [
    source.compensationRange
      ? `Competitive pay: ${source.compensationRange}.`
      : "Competitive pay, scoped to the level — discussed early, not at the last round.",
    "A hiring process you can see: role assessment, expert interview, and a written decision trail.",
    "Real ownership on a small team — you will see your work reach users.",
  ];
  if (source.location?.toLowerCase().includes("remote")) {
    benefits.push("Remote-friendly working arrangement for this role.");
  } else if (source.location?.toLowerCase().includes("hybrid")) {
    benefits.push(`Hybrid working from ${source.location}.`);
  }
  if (source.companyEmployees && source.companyEmployees <= 200) {
    benefits.push("Early-team impact: help define how this company builds and hires.");
  }
  return benefits;
}

function defaultAboutCompany(source: JobPostingSource) {
  const industry = source.companyIndustry?.trim();
  const size = source.companyEmployees
    ? ` about ${source.companyEmployees} people`
    : "";
  const industryBit = industry
    ? ` in ${industry.toLowerCase()}`
    : "";
  return `${source.companyName} is a company${size}${industryBit}. This role is hired through HireIQ: every applicant takes the same skills assessment and is reviewed by an independent expert, so the team decides from evidence instead of a pile of résumés.`;
}
