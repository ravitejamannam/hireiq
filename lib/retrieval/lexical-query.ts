import { JobRequirementCategory } from "@prisma/client";

import { createHash } from "node:crypto";

import { canonicalSkillKey } from "@/lib/ontology/skill-alias";
import type { LexicalQuery, LexicalQueryTerm } from "@/lib/retrieval/lexical-retrieval-types";

export type StructuredRequirementInput = {
  sourceField: string;
  sourceText: string;
  category: JobRequirementCategory;
  normalizedValue: string | null;
  skillCanonicalKey: string | null;
};

function isSkillSource(sourceField: string) {
  return (
    sourceField === "primarySkills" ||
    sourceField === "mustHaveRequirements" ||
    sourceField === "niceToHaveRequirements"
  );
}

export function buildLexicalQuery(
  requirements: StructuredRequirementInput[],
): LexicalQuery {
  const terms: LexicalQueryTerm[] = [];
  const seen = new Set<string>();

  for (const requirement of requirements) {
    if (requirement.sourceField === "location") {
      const key = canonicalSkillKey(
        requirement.normalizedValue ?? requirement.sourceText,
      );
      if (!key || seen.has(`LOCATION:${key}`)) {
        continue;
      }
      seen.add(`LOCATION:${key}`);
      terms.push({
        key,
        kind: "LOCATION",
        sourceText: requirement.sourceText,
        category: requirement.category,
      });
      continue;
    }

    const skillLike =
      requirement.category === JobRequirementCategory.REQUIRED ||
      requirement.category === JobRequirementCategory.PREFERRED;
    if (!skillLike || !isSkillSource(requirement.sourceField)) {
      continue;
    }

    const key =
      requirement.skillCanonicalKey ??
      canonicalSkillKey(requirement.normalizedValue ?? requirement.sourceText);
    if (!key || seen.has(`SKILL:${key}`)) {
      continue;
    }
    seen.add(`SKILL:${key}`);
    terms.push({
      key,
      kind: "SKILL",
      sourceText: requirement.sourceText,
      category: requirement.category,
    });
  }

  return { terms };
}

export function hashLexicalQuery(query: LexicalQuery) {
  return createHash("sha256")
    .update(
      query.terms
        .map((term) => `${term.kind}:${term.key}`)
        .sort()
        .join("\n"),
      "utf8",
    )
    .digest("hex");
}
