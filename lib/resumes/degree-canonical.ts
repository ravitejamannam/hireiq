/**
 * One short form for Indian degree names. The quote on the field stays
 * the wording from the resume.
 */
const DEGREE_FORMS: Array<{ canonical: string; pattern: RegExp }> = [
  { canonical: "B.Tech", pattern: /\b(bachelor of technology|b\.?\s?tech)\b/i },
  { canonical: "M.Tech", pattern: /\b(master of technology|m\.?\s?tech)\b/i },
  { canonical: "MCA", pattern: /\b(master of computer applications|m\.?\s?c\.?\s?a\.?)\b/i },
  { canonical: "BCA", pattern: /\b(bachelor of computer applications|b\.?\s?c\.?\s?a\.?)\b/i },
  { canonical: "MBA", pattern: /\b(master of business administration|m\.?\s?b\.?\s?a\.?|pgdbm|post graduate diploma in business management)\b/i },
  { canonical: "PGDM", pattern: /\b(post graduate diploma in management|p\.?\s?g\.?\s?d\.?\s?m\.?)\b/i },
  { canonical: "B.E", pattern: /\bbachelor of eng(?:ineering|inerring)\b/i },
  { canonical: "B.E", pattern: /\bB\.?\s?E\b/ },
  { canonical: "M.E", pattern: /\bmaster of engineering\b/i },
  { canonical: "M.E", pattern: /\bM\.?\s?E\b/ },
  { canonical: "B.Sc", pattern: /\b(bachelor of science|b\.?\s?sc)\b/i },
  { canonical: "M.Sc", pattern: /\b(master of science|m\.?\s?sc)\b/i },
  { canonical: "B.Com", pattern: /\b(bachelor of commerce|b\.?\s?com)\b/i },
  { canonical: "M.Com", pattern: /\b(master of commerce|m\.?\s?com)\b/i },
  { canonical: "Diploma", pattern: /\bdiploma\b/i },
  { canonical: "ITI", pattern: /\biti\b/i },
  { canonical: "10th", pattern: /\b(10th|ssc|matriculation)\b/i },
  { canonical: "12th", pattern: /\b(12th|hsc|intermediate|higher secondary)\b/i },
];

const DEGREE_STOP = new Set(["in", "of", "the", "and", "at", "nganh", "tong", "hop", "chuyen"]);

export function canonicalDegree(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const match = DEGREE_FORMS.find((form) => form.pattern.test(text));
  return match?.canonical ?? null;
}

function degreeWords(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !DEGREE_STOP.has(word));
}

export function degreesMatch(expected: string, actual: string) {
  const left = canonicalDegree(expected);
  const right = canonicalDegree(actual);
  if (left && right) return left === right;
  const a = degreeWords(expected);
  const b = degreeWords(actual);
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every((word) => longer.includes(word));
}
