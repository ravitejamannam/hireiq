export type PrimarySkillToken = {
  display: string;
  normalized: string;
};

export function normalizeMatchingText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function tokenizePrimarySkills(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return [] as PrimarySkillToken[];
  }

  const seen = new Set<string>();
  const tokens: PrimarySkillToken[] = [];

  for (const part of value.split(/[,;\n]+/)) {
    const display = part.trim().replace(/\s+/g, " ");
    if (!display) {
      continue;
    }
    const normalized = display.toLowerCase();
    if (normalized.length < 2) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tokens.push({ display, normalized });
  }

  return tokens;
}
