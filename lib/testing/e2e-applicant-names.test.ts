import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { backendJobTitle, E2E_SEED_ORDER, seededApplicantIndex, seededApplicantName } from "./e2e-applicant-names";

const read = (file: string) => readFileSync(file, "utf8");

describe("E2E seeded applicant names", () => {
  it("round-trips a name through the lookup", () => {
    for (const index of [1, 2, 4, 6, 49]) {
      expect(seededApplicantIndex(seededApplicantName("nimbus", index), "nimbus")).toBe(index);
    }
    expect(seededApplicantName("nimbus", 2)).toBe("nimbus Applicant 2");
  });

  it("does not match the resume-backed applicants that e2e-full-run creates", () => {
    // Root cause of "missing applicant": full-run names its applicants "Applicant <slug> <n>".
    expect(seededApplicantIndex("Applicant nimbus 2", "nimbus")).toBeNull();
    expect(seededApplicantIndex("Shared Person", "nimbus")).toBeNull();
    expect(seededApplicantIndex("kaveri Applicant 2", "nimbus")).toBeNull();
    expect(seededApplicantIndex("nimbus Applicant 2x", "nimbus")).toBeNull();
  });

  it("the creating script and the lookup script use the same helper", () => {
    const followup = read("scripts/e2e-full-followup.ts");
    const remaining = read("scripts/e2e-remaining-flows.ts");
    expect(followup).toContain("seededApplicantName(slug, index)");
    expect(remaining).toContain('seededApplicantName("nimbus", 2)');
    expect(remaining).toContain('seededApplicantName("nimbus", 4)');
    expect(remaining).toContain('seededApplicantName("nimbus", 6)');
    expect(remaining).not.toMatch(/"nimbus Applicant \d+"/);
    expect(followup).not.toMatch(/`\$\{slug\} Applicant/);
  });

  it("runs the creator before the lookup in the documented order", () => {
    const order = [...E2E_SEED_ORDER];
    expect(order.indexOf("scripts/e2e-full-followup.ts")).toBeLessThan(order.indexOf("scripts/e2e-remaining-flows.ts"));
    expect(order.indexOf("scripts/e2e-full-run.ts")).toBe(0);
    expect(order.at(-1)).toBe("scripts/e2e-playwright-prep.ts");
  });

  it("followup targets the exact backend job that remaining-flows reads, not a 'contains Backend' guess", () => {
    expect(backendJobTitle("Nimbus Labs")).toBe("Nimbus Labs: Backend Engineer");
    expect(read("scripts/e2e-remaining-flows.ts")).toContain('title: "Nimbus Labs: Backend Engineer"');
    const followup = read("scripts/e2e-full-followup.ts");
    expect(followup).toContain("title: backendJobTitle(nimbus.name)");
    expect(followup).not.toMatch(/title: \{ contains: "Backend" \}/);
  });

  it("remaining-flows fails with a clear setup message instead of 'missing applicant' when followup has not run", () => {
    const remaining = read("scripts/e2e-remaining-flows.ts");
    expect(remaining).toContain("Run scripts/e2e-full-followup.ts before this script");
    expect(remaining.indexOf("Run scripts/e2e-full-followup.ts")).toBeLessThan(remaining.indexOf("seededApplicantName(\"nimbus\", 2)"));
  });
});
