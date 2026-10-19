import { describe, expect, it } from "vitest";

import { isResumeSkillPhrase } from "@/lib/resumes/skill-phrase";

describe("isResumeSkillPhrase", () => {
  it("keeps tools, trades, and equipment", () => {
    expect(isResumeSkillPhrase("AutoCAD")).toBe(true);
    expect(isResumeSkillPhrase("STAAD Pro v8i")).toBe(true);
    expect(isResumeSkillPhrase("Electrical Engineering")).toBe(true);
    expect(isResumeSkillPhrase("Tower Cranes")).toBe(true);
    expect(isResumeSkillPhrase("Hindi & English")).toBe(true);
  });

  it("drops sentences, titles, traits, and fragments", () => {
    expect(isResumeSkillPhrase("Operation & Maintenance of HVAC Systems")).toBe(false);
    expect(isResumeSkillPhrase("HSE ENGINEER")).toBe(false);
    expect(isResumeSkillPhrase("Detail Oriented")).toBe(false);
    expect(isResumeSkillPhrase("Make every effort to save energy.")).toBe(false);
    expect(isResumeSkillPhrase("8.1)")).toBe(false);
    expect(isResumeSkillPhrase("Club player in football")).toBe(false);
    expect(isResumeSkillPhrase("Meeting Room")).toBe(false);
    expect(isResumeSkillPhrase("Dubai")).toBe(false);
    expect(isResumeSkillPhrase("Self motivator")).toBe(false);
    expect(isResumeSkillPhrase("Preparation and")).toBe(false);
    expect(isResumeSkillPhrase("Operating and")).toBe(false);
  });
});
