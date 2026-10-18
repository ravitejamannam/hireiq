export const ONTOLOGY_VERSION = "v1";
export const ONTOLOGY_PROVENANCE = "hireiq-curated-v1";

export type CatalogConcept = {
  canonicalKey: string;
  displayName: string;
  aliases: string[];
};

/**
 * Small curated alias set. Related technologies are distinct concepts.
 * React !== React Native. Python !== Django. PostgreSQL !== MySQL.
 */
export const SKILL_CONCEPT_CATALOG: CatalogConcept[] = [
  { canonicalKey: "javascript", displayName: "JavaScript", aliases: ["javascript", "js"] },
  { canonicalKey: "typescript", displayName: "TypeScript", aliases: ["typescript", "ts"] },
  { canonicalKey: "python", displayName: "Python", aliases: ["python", "python3"] },
  { canonicalKey: "django", displayName: "Django", aliases: ["django"] },
  { canonicalKey: "flask", displayName: "Flask", aliases: ["flask"] },
  { canonicalKey: "fastapi", displayName: "FastAPI", aliases: ["fastapi"] },
  { canonicalKey: "react", displayName: "React", aliases: ["react", "react.js", "reactjs"] },
  {
    canonicalKey: "react_native",
    displayName: "React Native",
    aliases: ["react native", "react-native", "reactnative"],
  },
  {
    canonicalKey: "postgresql",
    displayName: "PostgreSQL",
    aliases: ["postgresql", "postgres", "psql"],
  },
  { canonicalKey: "mysql", displayName: "MySQL", aliases: ["mysql"] },
  { canonicalKey: "golang", displayName: "Go", aliases: ["go", "golang"] },
  {
    canonicalKey: "redis",
    displayName: "Redis",
    aliases: ["redis"],
  },
  {
    canonicalKey: "kubernetes",
    displayName: "Kubernetes",
    aliases: ["kubernetes", "k8s"],
  },
  {
    canonicalKey: "aws",
    displayName: "AWS",
    aliases: ["aws", "amazon web services"],
  },
  { canonicalKey: "kafka", displayName: "Kafka", aliases: ["kafka"] },
  { canonicalKey: "nodejs", displayName: "Node.js", aliases: ["node.js", "nodejs", "node"] },
  { canonicalKey: "java", displayName: "Java", aliases: ["java"] },
];

export function normalizeOntologyText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
