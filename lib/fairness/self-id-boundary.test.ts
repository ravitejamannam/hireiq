import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const EVALUATION_DIRS = [
  "lib/candidates/matching",
  "lib/ai",
  "lib/retrieval",
  "lib/review",
  "lib/talent",
  "lib/resumes",
  "lib/jobs",
  "lib/copilot",
];

function filesUnder(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

describe("self-identification boundary", () => {
  it("keeps the self-id table out of evaluation code", () => {
    const offenders: string[] = [];
    for (const relative of EVALUATION_DIRS) {
      for (const file of filesUnder(path.join(ROOT, relative))) {
        const text = readFileSync(file, "utf8");
        if (text.includes("CandidateSelfIdentification") || text.includes("fairness/self-id") || text.includes("selfIdentificationsForCompany")) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
