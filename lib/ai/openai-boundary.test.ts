import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const ALLOWED = new Set([path.normalize("lib/ai/gateway.ts")]);

function filesUnder(dir: string): string[] {
  const skip = new Set(["node_modules", ".next", ".next-e2e", ".next-roadmap", "lib/generated", ".data", "coverage"]);
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      found.push(...filesUnder(full));
      continue;
    }
    if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(entry)) continue;
    if (/\.(ts|tsx|mjs|js)$/.test(entry)) found.push(full);
  }
  return found;
}

describe("OpenAI call boundary", () => {
  it("keeps the provider host inside the gateway", () => {
    const providerHost = ["api", "openai", "com"].join(".");
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      const relative = path.relative(ROOT, file);
      if (ALLOWED.has(path.normalize(relative))) continue;
      const text = readFileSync(file, "utf8");
      if (text.includes(`https://${providerHost}`) || /from ["']openai["']/.test(text)) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });
});
