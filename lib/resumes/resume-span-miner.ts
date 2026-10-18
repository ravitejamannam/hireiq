import { SKILL_CONCEPT_CATALOG } from "@/lib/ontology/skill-alias-catalog";

/**
 * Grounded resume spans for layouts the line patterns miss:
 * Indeed-style title/company blocks, "Title - Company" headers,
 * education sections, and skill lists. Every returned string is copied
 * from the source.
 */

const HEADER_FOOTER =
  /^(page\s+\d+(\s+of\s+\d+)?|confidential|curriculum vitae|resume)$/i;

const NOUNS =
  "engineers?|developers?|consultants?|analysts?|managers?|interns?|architects?|designers?|testers?|administrators?|executives?|specialists?|associates?|directors?|officers?|trainees?|programmers?|scientists?|coordinators?|leads?|members?|recruiters?|accountants?|supervisors?|technicians?|operators?|representatives?|advisors?|sdet|presidents?|founders?|lecturers?|professors?|teachers?|auditors?|planners?|researchers?|owners?|partners?|faculty|writers?|editors?|clerks?|agents?|evangelists?|strategists?|statisticians?|counselors?|counsellors?|sourcers?|apprentices?|freshers?|trainers?|experts?|pmo|sme|dba|management|operations|internship|guard|student|support";

const SHORT_TITLE = new RegExp(
  `^(?:[•\\-\\*]\\s*)?((?:[\\w./+&()-]+\\s+){0,6}(?:${NOUNS}))\\.?$`,
  "i",
);
const TITLE_PHRASE = new RegExp(
  `\\b((?:[A-Z][\\w./+-]*|[A-Z]{2,}|senior|junior|lead|principal|staff|associate|assistant|chief|head|technical|software|sr\\.?|jr\\.?)(?:\\s+(?:[A-Za-z][\\w./+-]*|and|&|/)){0,5}\\s+(?:${NOUNS}))\\b`,
  "gi",
);
const SECTION =
  /^(work experience|professional experience|experience|education|skills|technical skills|projects?|summary|certifications?|personal details|languages|declaration|academic profile|achievements)$/i;
const VERB =
  /^(worked|responsible|involved|developed|designed|managed|handling|performed|created|implemented|using|experience|knowledge)\b/i;
const DEGREE = new RegExp(
  "\\b((?:bachelor|masters?|diploma|doctorate|ph\\.?\\s?d|pgdbm|sslc|h\\.?\\s?s\\.?\\s?c|s\\.?\\s?s\\.?\\s?l\\.?\\s?c|s\\.?\\s?s\\.?\\s?c|c\\.?\\s?b\\.?\\s?s\\.?\\s?e|i\\.?\\s?c\\.?\\s?s\\.?\\s?e|state board|intermediate|b\\.?\\s?-?\\s?tech|m\\.?\\s?-?\\s?tech|b\\.e|m\\.e|b\\.?\\s?sc|m\\.?\\s?sc|b\\.?\\s?com|m\\.?\\s?com|bca|mca|mba|bba|btech|mtech|btec)(?:\\s+[A-Za-z&.()-]{2,}){0,6})",
  "i",
);
const DATE_RANGE =
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*(?:to|–|—|-)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|present|current|till date|now|\d{4})\b/i;

const EMPLOYER =
  /\b(Microsoft|Accenture|Oracle|Sap(?:\s+labs)?|TCS|Infosys|Wipro|IBM|Amazon|Google|Deloitte|Cognizant|Capgemini|HCL|Cisco|NIIT|State Street|Tech Mahindra|Flipkart|Zoho|Mindtree)\b/;

const SKILL_LINE =
  /^(?:skills?|technical skills|key skills|languages(?:\s*&?\s*technologies)?|tools|databases|web technologies|frameworks)\s*[:\-]\s*(.+)$/i;

export type MinedRole = {
  title: string;
  organization: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type MinedResume = {
  titles: string[];
  companies: string[];
  degrees: string[];
  skills: string[];
  projects: string[];
  roles: MinedRole[];
};

/** Read left column, then right column, and drop running headers. */
export function layoutLines(source: string): string[] {
  const left: string[] = [];
  const right: string[] = [];
  let splitCount = 0;
  let kept = 0;
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || HEADER_FOOTER.test(trimmed)) continue;
    kept += 1;
    if (trimmed.includes("|") && trimmed.split("|").length >= 3) {
      for (const cell of trimmed.split("|").map((part) => part.trim()).filter(Boolean)) {
        left.push(cell);
      }
      continue;
    }
    if (/\s{3,}/.test(raw) && raw.trim().length > 24) {
      const parts = raw.split(/\s{3,}/).map((part) => part.trim()).filter(Boolean);
      if (parts.length === 2 && parts.every((part) => part.length <= 80)) {
        splitCount += 1;
        left.push(parts[0]);
        right.push(parts[1]);
        continue;
      }
    }
    left.push(trimmed);
  }
  if (kept >= 8 && splitCount / kept >= 0.3) return [...left, ...right];
  return left;
}

function foldKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniq(values: string[], cap: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = foldKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
    if (out.length >= cap) break;
  }
  return out;
}

function inSource(value: string, source: string) {
  return value.trim().length > 1 && source.includes(value.trim());
}

export function mineResumeSpans(source: string): MinedResume {
  const lines = layoutLines(source);
  const titles: string[] = [];
  const companies: string[] = [];
  const degrees: string[] = [];
  const skills: string[] = [];
  const projects: string[] = [];
  const roles: MinedRole[] = [];
  let education = false;
  let skillBlock = false;
  let projectBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^education\b/i.test(line)) {
      education = true;
      skillBlock = false;
      projectBlock = false;
    } else if (/^projects?\b/i.test(line)) {
      projectBlock = true;
      education = false;
      skillBlock = false;
    } else if (/^(skills|technical skills|key skills)\b/i.test(line)) {
      skillBlock = true;
      education = false;
      projectBlock = false;
    } else if (SECTION.test(line)) {
      education = false;
      skillBlock = false;
      projectBlock = false;
    }

    const skillLine = line.match(SKILL_LINE);
    if (skillLine) {
      skills.push(
        ...skillLine[1]
          .split(/[,|·•]/)
          .map((part) => part.trim())
          .filter((part) => part.length > 1 && part.length < 40),
      );
    } else if (
      skillBlock &&
      line.length < 80 &&
      !DATE_RANGE.test(line) &&
      !SHORT_TITLE.test(line) &&
      !/\bat\b/i.test(line) &&
      (line.includes(",") || /^[•\-*]/.test(line))
    ) {
      skills.push(
        ...line
          .replace(/^[•\-*]\s*/, "")
          .split(/[,|·]/)
          .map((part) => part.trim())
          .filter((part) => part.length > 1 && part.length < 40 && !/^and\b/i.test(part)),
      );
    }

    if (projectBlock && !SECTION.test(line) && line.length <= 80) {
      const named = line.match(/^(?:project\s*(?:name|title)?\s*[:\-]\s*|title\s*[:\-]\s*)(.+)$/i);
      const value = (named?.[1] ?? line).replace(/^[•\-*]\s*/, "").trim();
      if (value.length > 2 && value.length <= 80 && !VERB.test(value)) projects.push(value);
    }
    const inlineProject = line.match(/^projects?\s*[:\-]\s*(.{2,120})$/i);
    if (inlineProject) projects.push(inlineProject[1].trim());

    if (SECTION.test(line) || VERB.test(line)) continue;

    let title: string | null = null;
    if (line.length <= 72 && SHORT_TITLE.test(line) && line.split(/\s+/).length < 9) {
      title = line.match(SHORT_TITLE)?.[1]?.replace(/[\s.-]+$/g, "").trim() ?? null;
      if (title) titles.push(title);
    } else {
      TITLE_PHRASE.lastIndex = 0;
      for (const hit of line.matchAll(TITLE_PHRASE)) {
        const phrase = hit[1]?.trim();
        if (phrase && phrase.length <= 70 && phrase.split(/\s+/).length <= 8) {
          titles.push(phrase);
          title = title ?? phrase;
        }
      }
    }

    const at = line.match(/^(.{2,60}?)\s+at\s+(.{2,60})$/i);
    if (at && at[1].trim().split(/\s+/).length <= 8) {
      titles.push(at[1].trim());
      companies.push(at[2].trim());
      title = title ?? at[1].trim();
    }

    const dash = line.match(/^(.{2,70}?)\s+[-–—]\s+([A-Z][\w&.'' ]{1,40})/);
    if (dash && SHORT_TITLE.test(dash[1].trim())) {
      companies.push(dash[2].trim().replace(/[\s-]+$/g, ""));
    }

    const next = lines[index + 1] ?? "";
    if (
      title &&
      SHORT_TITLE.test(line) &&
      next.length > 1 &&
      next.length < 60 &&
      /^[A-Z]/.test(next) &&
      !SHORT_TITLE.test(next) &&
      !DATE_RANGE.test(next) &&
      !SECTION.test(next)
    ) {
      companies.push(next.split(/\s+-\s+/)[0].replace(/^[\s\-•]+|[\s\-•]+$/g, ""));
    }

    const employer = line.match(EMPLOYER);
    if (employer) companies.push(employer[1]);

    const degree = line.match(DEGREE);
    if (degree) {
      const phrase = degree[1].trim().replace(/[.,\s]+$/g, "");
      if (phrase.length > 2 && !/^(be|me|b|m)$/i.test(phrase)) degrees.push(phrase);
    }
    if (education && line.length > 2 && line.length < 90 && !SECTION.test(line)) {
      degrees.push(line.replace(/^[•\-]\s*/, "").trim());
    }

    const range = DATE_RANGE.exec(next) ?? DATE_RANGE.exec(line);
    if (title && range && inSource(title, source)) {
      const organization = companies.length ? companies[companies.length - 1] : null;
      roles.push({
        title,
        organization: organization && inSource(organization, source) ? organization : null,
        startDate: inSource(range[1], source) ? range[1] : null,
        endDate: inSource(range[2], source) ? range[2] : null,
      });
    }
  }

  for (const concept of SKILL_CONCEPT_CATALOG) {
    for (const alias of concept.aliases) {
      if (alias.length < 3 && !["js", "ts", "c#", "c++"].includes(alias.toLowerCase())) continue;
      const pattern = new RegExp(`(?:^|[^A-Za-z0-9])(${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^A-Za-z0-9])`, "i");
      const hit = source.match(pattern);
      if (hit?.[1]) skills.push(hit[1]);
    }
  }

  return {
    titles: uniq(titles.filter((value) => inSource(value, source)), 20),
    companies: uniq(companies.filter((value) => inSource(value, source)), 20),
    degrees: uniq(degrees.filter((value) => inSource(value, source)), 10),
    skills: uniq(skills.filter((value) => inSource(value, source)), 40),
    projects: uniq(projects.filter((value) => inSource(value, source)), 12),
    roles: roles.slice(0, 12),
  };
}
