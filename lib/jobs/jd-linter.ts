const GENDERED = /\b(he|she|guys|ninja|rockstar|manpower)\b/i;
const AGE_CODED = /\b(young|recent graduate|digital native|energetic youngster)\b/i;

export type LintFinding = {
  ruleId: string;
  severity: "warning";
  message: string;
};

export type LintInput = {
  text: string;
  location: string | null;
  payBand: string | null;
  level: string | null;
  requiredCount: number;
  yearsRequired: number | null;
  degreeRequired: boolean;
  degreeJustification: string | null;
};

function readingEase(text: string) {
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((sum, word) => sum + Math.max(1, word.replace(/[^aeiouy]/gi, "").length), 0);
  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = syllables / Math.max(1, words.length);
  return 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
}

export function lintJobDescription(input: LintInput): LintFinding[] {
  const findings: LintFinding[] = [];
  if (GENDERED.test(input.text)) {
    findings.push({ ruleId: "gendered-language", severity: "warning", message: "Gendered wording." });
  }
  if (AGE_CODED.test(input.text)) {
    findings.push({ ruleId: "age-coded-language", severity: "warning", message: "Age-coded wording." });
  }
  if (readingEase(input.text) < 40) {
    findings.push({ ruleId: "reading-level", severity: "warning", message: "Reading level is hard." });
  }
  if (input.text.length > 8000) {
    findings.push({ ruleId: "length", severity: "warning", message: "Description is long." });
  }
  const needsPay = /\b(CA|California|NY|New York|CO|Colorado)\b/i.test(input.location ?? "");
  if (needsPay && !input.payBand?.trim()) {
    findings.push({ ruleId: "missing-pay", severity: "warning", message: "Pay band is missing for this location." });
  }
  if (input.requiredCount > 7) {
    findings.push({ ruleId: "required-count", severity: "warning", message: "More than 7 required items." });
  }
  if (input.level === "junior" && (input.yearsRequired ?? 0) > 3) {
    findings.push({ ruleId: "years-vs-level", severity: "warning", message: "Years of experience exceed the level." });
  }
  if (input.degreeRequired && !input.degreeJustification?.trim()) {
    findings.push({ ruleId: "degree-justification", severity: "warning", message: "Degree is required without a justification." });
  }
  return findings;
}

export function dismissLint(input: { ruleId: string; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A dismissal needs a reason.");
  return { ruleId: input.ruleId, reason };
}
