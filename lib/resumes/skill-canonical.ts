/**
 * Alias map so "ReactJS" and "React.js" land on one skill.
 * The quote stored with the field stays the wording from the resume.
 */
const CANONICAL_SKILLS: Record<string, string> = {
  react: "React",
  reactjs: "React",
  "react.js": "React",
  "react js": "React",
  node: "Node.js",
  nodejs: "Node.js",
  "node.js": "Node.js",
  "node js": "Node.js",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  python: "Python",
  java: "Java",
  aws: "Amazon Web Services",
  "amazon web services": "Amazon Web Services",
  gcp: "Google Cloud",
  "google cloud": "Google Cloud",
  "google cloud platform": "Google Cloud",
  azure: "Microsoft Azure",
  "machine learning": "Machine Learning",
  ml: "Machine Learning",
  sql: "SQL",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  "next.js": "Next.js",
  nextjs: "Next.js",
  hindi: "Hindi",
};

export function canonicalSkill(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return CANONICAL_SKILLS[key] ?? raw.trim();
}
