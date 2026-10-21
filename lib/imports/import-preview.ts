import { decideIntakeMatch } from "@/lib/candidates/intake-match";
import {
  maskEmail,
  normalizeEmail,
  phoneDigits,
  type ImportMapping,
} from "@/lib/imports/import-mapping";
import type { ParsedSheet } from "@/lib/imports/spreadsheet";

export type KnownCandidate = {
  candidateId: number;
  companyId: number;
  name: string;
  email: string | null;
  phoneDigits: string | null;
  currentEmployer: string | null;
  erased: boolean;
};

export type PreviewRow = {
  rowNumber: number;
  name: string;
  emailMasked: string | null;
  errors: string[];
  warnings: string[];
  proposal: "create" | "attach" | "review" | "skip";
  matchCandidateId: number | null;
  matchName: string | null;
  suggestions: Array<{ candidateId: number; name: string; reason: string }>;
};

export type ImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: PreviewRow[];
  unmappedHeaders: string[];
  warnings: string[];
};

function cell(sheet: ParsedSheet, row: string[], field: keyof ImportMapping, mapping: ImportMapping) {
  const header = mapping[field];
  if (!header) return "";
  const index = sheet.headers.indexOf(header);
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

export function buildImportPreview(input: {
  sheet: ParsedSheet;
  mapping: ImportMapping;
  jobId: number;
  known: KnownCandidate[];
  companyId: number;
}): ImportPreview {
  const warnings: string[] = [];
  if (!input.mapping.name) {
    warnings.push("Map a column to the candidate name before importing.");
  }
  const mappedHeaders = new Set(Object.values(input.mapping).filter(Boolean));
  const unmappedHeaders = input.sheet.headers.filter((header) => !mappedHeaders.has(header));
  if (unmappedHeaders.some((header) => /resume|cv/i.test(header))) {
    warnings.push("Resume columns are not downloaded. Add the file later from the candidate record.");
  }

  const seenEmails = new Map<string, number>();
  const rows: PreviewRow[] = [];
  const companyKnown = input.known.filter((candidate) => candidate.companyId === input.companyId);

  input.sheet.rows.forEach((source, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const rowWarnings: string[] = [];
    const name = cell(input.sheet, source, "name", input.mapping);
    const emailRaw = cell(input.sheet, source, "email", input.mapping);
    const phoneRaw = cell(input.sheet, source, "phone", input.mapping);
    const employer = cell(input.sheet, source, "currentEmployer", input.mapping);
    const sourceJob = cell(input.sheet, source, "sourceJobId", input.mapping);
    const experience = cell(input.sheet, source, "experience", input.mapping);

    if (!input.mapping.name) errors.push("Name column is not mapped.");
    else if (name.length < 2) errors.push("Name is required.");
    else if (name.length > 120) errors.push("Name is too long.");

    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (email === "invalid") errors.push("Email address is invalid.");
    if (!emailRaw) rowWarnings.push("No email. This row cannot be matched to an existing person by email.");
    if (experience && !/^\d{1,2}$/.test(experience)) {
      rowWarnings.push("Experience is not a whole number of years and will be ignored.");
    }
    if (sourceJob && sourceJob !== String(input.jobId)) {
      errors.push("Source job id does not match the job you selected.");
    }
    if (/^'[=+\-@]/.test(name) || /^'[=+\-@]/.test(emailRaw)) {
      rowWarnings.push("A cell looked like a formula and was stored as text.");
    }

    if (typeof email === "string") {
      const first = seenEmails.get(email);
      if (first != null) {
        errors.push(`Duplicate email in this file. First used on row ${first}.`);
      } else {
        seenEmails.set(email, rowNumber);
      }
    }

    const decision = decideIntakeMatch({
      companyId: input.companyId,
      email: typeof email === "string" ? email : null,
      phoneDigits: phoneDigits(phoneRaw),
      name,
      employer,
      known: companyKnown,
    });
    const erasedHit = decision.decision === "erased";
    if (erasedHit) errors.push("This email belongs to an erased candidate and cannot be imported.");

    let proposal: PreviewRow["proposal"] = "create";
    let matchCandidateId: number | null = null;
    let matchName: string | null = null;
    if (errors.length > 0) proposal = "skip";
    else if (decision.decision === "review") {
      proposal = "review";
      rowWarnings.push("More than one existing person has this email. Choose one or skip the row.");
    } else if (decision.decision === "attach") {
      proposal = "attach";
      matchCandidateId = decision.candidateId;
      matchName = decision.name;
    }

    rows.push({
      rowNumber,
      name: name.slice(0, 120),
      emailMasked: typeof email === "string" ? maskEmail(email) : null,
      errors,
      warnings: rowWarnings,
      proposal,
      matchCandidateId,
      matchName,
      suggestions: decision.suggestions,
    });
  });

  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.proposal === "create" || row.proposal === "attach").length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
    duplicateRows: rows.filter((row) => row.errors.some((error) => error.startsWith("Duplicate email"))).length,
    rows,
    unmappedHeaders,
    warnings,
  };
}
