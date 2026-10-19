import { describe, expect, it } from "vitest";

import {
  employersNearMatch,
  skillLabelTokens,
  skillsMatch,
} from "@/lib/resumes/fixture-score";

describe("fixture scoring", () => {
  it("strips skill headings and year fragments", () => {
    const tokens = skillLabelTokens(
      "Languages: Core Java, Go Lang\nTools: RADTool\nAPEX. (Less than 1 year), Oracle (5 years)",
    );
    expect(tokens).toContain("Core Java");
    expect(tokens).toContain("RADTool");
    expect(tokens).toContain("Oracle");
    expect(tokens.join(" ")).not.toMatch(/Languages:|5 years|Less than/);
  });

  it("matches aliases without treating Java as JavaScript", () => {
    expect(skillsMatch("ReactJS", "React")).toBe(true);
    expect(skillsMatch("Java", "JavaScript")).toBe(false);
  });

  it("treats singular and Pvt Ltd variants as the same company", () => {
    expect(employersNearMatch("PandC Constructions Pvt. Ltd", "PANDC CONSTRUCTION Pvt Ltd")).toBe(true);
    expect(employersNearMatch("Cethar Limited", "CETHAR")).toBe(true);
  });
});
