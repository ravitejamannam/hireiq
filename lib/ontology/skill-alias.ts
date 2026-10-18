import {
  ONTOLOGY_VERSION,
  SKILL_CONCEPT_CATALOG,
  normalizeOntologyText,
} from "@/lib/ontology/skill-alias-catalog";

export { ONTOLOGY_VERSION, normalizeOntologyText };

export type ResolvedSkill = {
  canonicalKey: string;
  displayName: string;
  matchedAlias: string;
  viaAlias: boolean;
};

const aliasIndex = new Map<string, ResolvedSkill>();

for (const concept of SKILL_CONCEPT_CATALOG) {
  for (const alias of concept.aliases) {
    const normalized = normalizeOntologyText(alias);
    aliasIndex.set(normalized, {
      canonicalKey: concept.canonicalKey,
      displayName: concept.displayName,
      matchedAlias: normalized,
      viaAlias: normalized !== concept.canonicalKey && normalized !== normalizeOntologyText(concept.displayName),
    });
  }
  aliasIndex.set(concept.canonicalKey, {
    canonicalKey: concept.canonicalKey,
    displayName: concept.displayName,
    matchedAlias: concept.canonicalKey,
    viaAlias: false,
  });
}

export function resolveSkillAlias(value: string): ResolvedSkill | null {
  const normalized = normalizeOntologyText(value);
  if (!normalized) {
    return null;
  }
  return aliasIndex.get(normalized) ?? null;
}

export function canonicalSkillKey(value: string) {
  return resolveSkillAlias(value)?.canonicalKey ?? normalizeOntologyText(value);
}

export function catalogAliasesLongestFirst() {
  const aliases = [...aliasIndex.keys()].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return aliases;
}

/** A database implies SQL. The specific database stays its own skill. */
const SKILL_IMPLICATIONS: Record<string, string[]> = {
  postgresql: ["sql"],
  mysql: ["sql"],
  sqlserver: ["sql"],
};

export function impliedSkillKeys(canonicalKey: string): string[] {
  return SKILL_IMPLICATIONS[canonicalKey] ?? [];
}

export function isKnownDistinctPair(left: string, right: string) {
  const leftKey = canonicalSkillKey(left);
  const rightKey = canonicalSkillKey(right);
  return leftKey !== rightKey;
}
