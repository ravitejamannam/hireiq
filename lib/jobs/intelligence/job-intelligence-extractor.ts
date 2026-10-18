import { createHash } from "node:crypto";

import {
  JobRequirementCategory,
  JobRequirementUncertainty,
} from "@prisma/client";

import { tokenizePrimarySkills } from "@/lib/candidates/matching/skill-tokenizer";
import { JOB_INTELLIGENCE_PROVENANCE } from "@/lib/jobs/intelligence/job-intelligence-versions";
import type {
  RequirementDraft,
  SpecExtractionInput,
} from "@/lib/jobs/intelligence/job-intelligence-types";
import { canonicalSkillKey, resolveSkillAlias } from "@/lib/ontology/skill-alias";

const CONSTRAINT_PATTERN =
  /\b(visa|authoriz|citizen|remote|on-?site|hybrid|full[ -]?time|part[ -]?time|contract|clearance|reloc|work permit|employment type)\b/i;

const RESPONSIBILITY_PATTERN =
  /\b(design|build|operate|collaborate|own|lead|improve|maintain|develop|implement|partner|work with|responsible for)\b/i;

function spanOf(source: string, snippet: string): { start: number | null; end: number | null } {
  const index = source.indexOf(snippet);
  if (index < 0) {
    return { start: null, end: null };
  }
  return { start: index, end: index + snippet.length };
}

function splitLines(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitSentences(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function skillMentionedIn(text: string) {
  const words = text.split(/[^A-Za-z0-9+#.]+/).filter((word) => word.length >= 2);
  for (const word of words) {
    const resolved = resolveSkillAlias(word);
    if (resolved) return resolved;
  }
  return null;
}

function isSkillLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 48) {
    return false;
  }
  if (wordCount(trimmed) > 6) {
    return false;
  }
  if (/[.!?]/.test(trimmed) && !/\w\.\w/.test(trimmed)) {
    return false;
  }
  if (resolveSkillAlias(trimmed)) {
    return true;
  }
  return !CONSTRAINT_PATTERN.test(trimmed);
}

function isConstraintLike(value: string) {
  return CONSTRAINT_PATTERN.test(value);
}

function isResponsibilityLike(value: string) {
  return wordCount(value) >= 6 && RESPONSIBILITY_PATTERN.test(value);
}

function pushUnique(
  rows: RequirementDraft[],
  seen: Set<string>,
  draft: RequirementDraft,
) {
  if (seen.has(draft.stableKey)) {
    return;
  }
  seen.add(draft.stableKey);
  rows.push(draft);
}

export function hashJobIntelligenceInput(input: SpecExtractionInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title,
        primarySkills: input.primarySkills ?? "",
        mustHaveRequirements: input.mustHaveRequirements ?? "",
        niceToHaveRequirements: input.niceToHaveRequirements ?? "",
        location: input.location ?? "",
        experienceRange: input.experienceRange ?? "",
        jobDescription: input.jobDescription ?? "",
        evaluationCriteria: input.evaluationCriteria ?? "",
        screeningQuestions: input.screeningQuestions ?? [],
        rubricCriteria: input.rubricCriteria ?? [],
      }),
      "utf8",
    )
    .digest("hex");
}

export function extractJobRequirements(
  input: SpecExtractionInput,
): RequirementDraft[] {
  const rows: RequirementDraft[] = [];
  const seen = new Set<string>();

  for (const token of tokenizePrimarySkills(input.primarySkills)) {
    const resolved = resolveSkillAlias(token.display);
    const canonical = resolved?.canonicalKey ?? token.normalized;
    const span = spanOf(input.primarySkills ?? "", token.display);
    pushUnique(rows, seen, {
      stableKey: `primarySkills:${canonical}`,
      sourceField: "primarySkills",
      sourceText: token.display,
      sourceSpanStart: span.start,
      sourceSpanEnd: span.end,
      category: JobRequirementCategory.REQUIRED,
      normalizedValue: canonical,
      skillCanonicalKey: resolved?.canonicalKey ?? null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.CERTAIN,
    });
  }

  if (input.location?.trim()) {
    const sourceText = input.location.trim();
    pushUnique(rows, seen, {
      stableKey: `location:${canonicalSkillKey(sourceText)}`,
      sourceField: "location",
      sourceText,
      sourceSpanStart: 0,
      sourceSpanEnd: sourceText.length,
      category: JobRequirementCategory.HARD_CONSTRAINT,
      normalizedValue: canonicalSkillKey(sourceText),
      skillCanonicalKey: null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.CERTAIN,
    });
  }

  if (input.experienceRange?.trim()) {
    const sourceText = input.experienceRange.trim();
    pushUnique(rows, seen, {
      stableKey: `experienceRange:${canonicalSkillKey(sourceText)}`,
      sourceField: "experienceRange",
      sourceText,
      sourceSpanStart: 0,
      sourceSpanEnd: sourceText.length,
      category: JobRequirementCategory.CONSTRAINT,
      normalizedValue: canonicalSkillKey(sourceText),
      skillCanonicalKey: null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.CERTAIN,
    });
  }

  for (const criterion of input.rubricCriteria ?? []) {
    if (!isSkillLike(criterion)) continue;
    const resolved = resolveSkillAlias(criterion);
    const canonical = resolved?.canonicalKey ?? canonicalSkillKey(criterion);
    pushUnique(rows, seen, {
      stableKey: `scoringRubric:${canonical}`,
      sourceField: "scoringRubric",
      sourceText: criterion,
      sourceSpanStart: null,
      sourceSpanEnd: null,
      category: JobRequirementCategory.REQUIRED,
      normalizedValue: canonical,
      skillCanonicalKey: resolved?.canonicalKey ?? null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: resolved
        ? JobRequirementUncertainty.CERTAIN
        : JobRequirementUncertainty.AMBIGUOUS,
    });
  }

  for (const question of input.screeningQuestions ?? []) {
    const resolved = resolveSkillAlias(question) ?? skillMentionedIn(question);
    if (!resolved && !isSkillLike(question)) continue;
    const display = resolved ? question : question;
    const canonical = resolved?.canonicalKey ?? canonicalSkillKey(question);
    pushUnique(rows, seen, {
      stableKey: `screeningQuestions:${canonical}`,
      sourceField: "screeningQuestions",
      sourceText: display,
      sourceSpanStart: null,
      sourceSpanEnd: null,
      category: JobRequirementCategory.REQUIRED,
      normalizedValue: canonical,
      skillCanonicalKey: resolved?.canonicalKey ?? null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: resolved
        ? JobRequirementUncertainty.CERTAIN
        : JobRequirementUncertainty.AMBIGUOUS,
    });
  }

  for (const line of splitLines(input.mustHaveRequirements)) {
    const span = spanOf(input.mustHaveRequirements ?? "", line);
    if (isSkillLike(line)) {
      const resolved = resolveSkillAlias(line);
      const canonical = resolved?.canonicalKey ?? canonicalSkillKey(line);
      pushUnique(rows, seen, {
        stableKey: `mustHaveRequirements:${canonical}`,
        sourceField: "mustHaveRequirements",
        sourceText: line,
        sourceSpanStart: span.start,
        sourceSpanEnd: span.end,
        category: JobRequirementCategory.REQUIRED,
        normalizedValue: canonical,
        skillCanonicalKey: resolved?.canonicalKey ?? null,
        provenance: JOB_INTELLIGENCE_PROVENANCE,
        uncertainty: resolved
          ? JobRequirementUncertainty.CERTAIN
          : JobRequirementUncertainty.AMBIGUOUS,
      });
      continue;
    }
    if (isConstraintLike(line)) {
      pushUnique(rows, seen, {
        stableKey: `mustHaveRequirements:${canonicalSkillKey(line)}`,
        sourceField: "mustHaveRequirements",
        sourceText: line,
        sourceSpanStart: span.start,
        sourceSpanEnd: span.end,
        category: JobRequirementCategory.HARD_CONSTRAINT,
        normalizedValue: canonicalSkillKey(line),
        skillCanonicalKey: null,
        provenance: JOB_INTELLIGENCE_PROVENANCE,
        uncertainty: JobRequirementUncertainty.CERTAIN,
      });
      continue;
    }
    pushUnique(rows, seen, {
      stableKey: `mustHaveRequirements:${canonicalSkillKey(line)}`,
      sourceField: "mustHaveRequirements",
      sourceText: line,
      sourceSpanStart: span.start,
      sourceSpanEnd: span.end,
      category: JobRequirementCategory.AMBIGUOUS,
      normalizedValue: canonicalSkillKey(line),
      skillCanonicalKey: null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.AMBIGUOUS,
    });
  }

  for (const line of splitLines(input.niceToHaveRequirements)) {
    const span = spanOf(input.niceToHaveRequirements ?? "", line);
    if (isSkillLike(line)) {
      const resolved = resolveSkillAlias(line);
      const canonical = resolved?.canonicalKey ?? canonicalSkillKey(line);
      pushUnique(rows, seen, {
        stableKey: `niceToHaveRequirements:${canonical}`,
        sourceField: "niceToHaveRequirements",
        sourceText: line,
        sourceSpanStart: span.start,
        sourceSpanEnd: span.end,
        category: JobRequirementCategory.PREFERRED,
        normalizedValue: canonical,
        skillCanonicalKey: resolved?.canonicalKey ?? null,
        provenance: JOB_INTELLIGENCE_PROVENANCE,
        uncertainty: resolved
          ? JobRequirementUncertainty.CERTAIN
          : JobRequirementUncertainty.AMBIGUOUS,
      });
      continue;
    }
    pushUnique(rows, seen, {
      stableKey: `niceToHaveRequirements:${canonicalSkillKey(line)}`,
      sourceField: "niceToHaveRequirements",
      sourceText: line,
      sourceSpanStart: span.start,
      sourceSpanEnd: span.end,
      category: JobRequirementCategory.AMBIGUOUS,
      normalizedValue: canonicalSkillKey(line),
      skillCanonicalKey: null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.AMBIGUOUS,
    });
  }

  for (const sentence of splitSentences(input.jobDescription)) {
    const span = spanOf(input.jobDescription ?? "", sentence);
    const category = isResponsibilityLike(sentence)
      ? JobRequirementCategory.RESPONSIBILITY
      : JobRequirementCategory.AMBIGUOUS;
    pushUnique(rows, seen, {
      stableKey: `jobDescription:${canonicalSkillKey(sentence)}`,
      sourceField: "jobDescription",
      sourceText: sentence,
      sourceSpanStart: span.start,
      sourceSpanEnd: span.end,
      category,
      normalizedValue: canonicalSkillKey(sentence),
      skillCanonicalKey: null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.AMBIGUOUS,
    });
  }

  for (const sentence of splitSentences(input.evaluationCriteria)) {
    const span = spanOf(input.evaluationCriteria ?? "", sentence);
    pushUnique(rows, seen, {
      stableKey: `evaluationCriteria:${canonicalSkillKey(sentence)}`,
      sourceField: "evaluationCriteria",
      sourceText: sentence,
      sourceSpanStart: span.start,
      sourceSpanEnd: span.end,
      category: JobRequirementCategory.AMBIGUOUS,
      normalizedValue: canonicalSkillKey(sentence),
      skillCanonicalKey: null,
      provenance: JOB_INTELLIGENCE_PROVENANCE,
      uncertainty: JobRequirementUncertainty.AMBIGUOUS,
    });
  }

  return rows;
}
