import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { canonicalSkill } from "@/lib/resumes/skill-canonical";
import { isResumeSkillPhrase } from "@/lib/resumes/skill-phrase";

const GENERIC_WORD = new Set([
  "good",
  "knowledge",
  "software",
  "skills",
  "skill",
  "experience",
  "management",
  "excellent",
  "proficient",
  "basic",
  "various",
  "using",
  "and",
  "the",
  "with",
  "for",
  "years",
  "year",
  "etc",
]);

const DEGREE_SKILL =
  /^(?:b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|b\.?\s?com|m\.?\s?com|mba|mca|bca|phd|ph\.?\s?d|diploma|bachelor|master|b\.?\s?a\b|m\.?\s?a\b)\b/i;

const HEADING =
  /^(?:languages(?:\s*&\s*technologies)?|tools|software|databases?|operating systems|web technologies|frameworks?|ides?|technical skills|skills|version control(?: system)?|middleware|product|others?)\s*:\s*/i;

/** Turn a DataTurks skill blob into matchable names. Headings and year fragments are not skills. */
export function skillLabelTokens(blob: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawPart of blob.split(/[,;\n•|]/)) {
    let part = rawPart.replace(HEADING, "").replace(/\([^)]*(?:year|month)[^)]*\)/gi, "");
    part = part.replace(/\b\d+(?:\.\d+)?\s*(?:years?|months?)\b/gi, "");
    part = part.replace(/^[\s:.\-]+|[\s:.\-]+$/g, "").trim();
    if (part.length < 2 || DEGREE_SKILL.test(part)) continue;
    const words = part.split(/\s+/);
    if (words.length === 1 && GENERIC_WORD.has(part.toLowerCase())) continue;
    if (words.length > 6) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function skillKey(value: string) {
  return canonicalSkill(value).toLowerCase().replace(/[^a-z0-9+#.\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function asWords(value: string) {
  return `(?:^|\\s)${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`;
}

/** Alias-aware match. "Java" does not count as "JavaScript". */
export function skillsMatch(expected: string, actual: string) {
  const left = skillKey(expected);
  const right = skillKey(actual);
  if (!left || !right || left.length < 2 || right.length < 2) return false;
  if (left === right) return true;
  return new RegExp(asWords(left), "i").test(right) || new RegExp(asWords(right), "i").test(left);
}

export function normalizeEmployerName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pvt|private|ltd|limited|inc|incorporated|co|company|corp|corporation|llc|llp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(value: string) {
  return value.replace(/s$/, "");
}

/** Singular/plural and "Pvt. Ltd" vs "Pvt Ltd" are the same employer. */
export function employersNearMatch(expected: string, actual: string) {
  if (labelsMatch(expected, actual)) return true;
  const left = normalizeEmployerName(expected);
  const right = normalizeEmployerName(actual);
  if (left.length < 4 || right.length < 4) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const a = singular(left);
  const b = singular(right);
  return a.length >= 4 && b.length >= 4 && (a === b || a.includes(b) || b.includes(a));
}

export function verifiedSkill(value: string, quote: string, source: string) {
  return Boolean(quote && source.includes(quote) && isResumeSkillPhrase(value) && !DEGREE_SKILL.test(value));
}
