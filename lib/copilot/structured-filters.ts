export type StructuredFilters = {
  skills: string[];
  minYears: number | null;
  location: string | null;
  stage: string | null;
};

const STAGES = ["applied", "screen", "interview", "offer"] as const;

export function proposeFilters(question: string): StructuredFilters {
  const skills = new Set<string>();
  const known = [
    "react",
    "reactjs",
    "node",
    "python",
    "java",
    "sql",
    "postgres",
    "postgresql",
    "kubernetes",
    "aws",
    "typescript",
    "javascript",
  ];
  const lower = question.toLowerCase();
  for (const skill of known) {
    if (new RegExp(`\\b${skill}\\b`, "i").test(lower)) skills.add(skill);
  }
  const years = lower.match(/\b(\d+)\s*\+?\s*years?\b/);
  const location = lower.match(/\b(?:in|at|from)\s+([a-z]+(?:\s+[a-z]+){0,2})/);
  const stage = STAGES.find((name) => new RegExp(`\\b${name}\\b`).test(lower)) ?? null;
  const place = location?.[1]?.replace(/\b(applied|screen|interview|offer|with|and)\b/g, "").replace(/\s+/g, " ").trim();
  return {
    skills: [...skills],
    minYears: years ? Number(years[1]) : null,
    location: place ? place : null,
    stage,
  };
}

export type FilterableCandidate = {
  name: string;
  skills: string[];
  years: number;
  location: string;
  stage: string;
};

export function applyStructuredFilters(rows: FilterableCandidate[], filters: StructuredFilters) {
  return rows.filter((row) => {
    if (filters.minYears != null && row.years < filters.minYears) return false;
    if (filters.location && !row.location.toLowerCase().includes(filters.location.toLowerCase())) return false;
    if (filters.stage && row.stage !== filters.stage) return false;
    if (filters.skills.length === 0) return true;
    const have = row.skills.map((skill) => skill.toLowerCase());
    return filters.skills.every((skill) =>
      have.some((item) => item.includes(skill) || skill.includes(item)),
    );
  });
}
