/**
 * One short form for Indian degree names. The quote on the field stays
 * the wording from the resume.
 */
const DEGREE_FORMS: Array<{ canonical: string; pattern: RegExp }> = [
  { canonical: "B.Tech", pattern: /\b(bachelor of technology|b\.?\s?tech)\b/i },
  { canonical: "M.Tech", pattern: /\b(master of technology|m\.?\s?tech)\b/i },
  { canonical: "MCA", pattern: /\b(master of computer applications|m\.?\s?c\.?\s?a\.?)\b/i },
  { canonical: "MBA", pattern: /\b(master of business administration|m\.?\s?b\.?\s?a\.?|pgdbm|post graduate diploma in business management)\b/i },
  { canonical: "B.E", pattern: /\bbachelor of eng(?:ineering|inerring)\b/i },
  { canonical: "B.E", pattern: /\bB\.?\s?E\b/ },
  { canonical: "M.E", pattern: /\bmaster of engineering\b/i },
  { canonical: "M.E", pattern: /\bM\.?\s?E\b/ },
  { canonical: "B.Sc", pattern: /\b(bachelor of science|b\.?\s?sc)\b/i },
  { canonical: "M.Sc", pattern: /\b(master of science|m\.?\s?sc)\b/i },
  { canonical: "B.Com", pattern: /\b(bachelor of commerce|b\.?\s?com)\b/i },
  { canonical: "M.Com", pattern: /\b(master of commerce|m\.?\s?com)\b/i },
];

export function canonicalDegree(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const match = DEGREE_FORMS.find((form) => form.pattern.test(text));
  return match?.canonical ?? null;
}

export function degreesMatch(expected: string, actual: string) {
  const left = canonicalDegree(expected);
  const right = canonicalDegree(actual);
  return Boolean(left && right && left === right);
}
