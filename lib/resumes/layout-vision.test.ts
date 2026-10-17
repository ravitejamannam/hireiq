import { mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { textLooksColumnJumbled } from "@/lib/resumes/extraction-quality";
import { LABELLED_RESUME_DIR, recall, scoreLabelledResumes } from "@/lib/resumes/labelled-fixtures";

describe("textLooksColumnJumbled", () => {
  it("flags a page that came back as many short lines", () => {
    const jumbled = Array.from({ length: 16 }, (_, index) => (index % 2 === 0 ? "React" : "2019")).join("\n");
    expect(textLooksColumnJumbled(jumbled)).toBe(true);
  });

  it("leaves a normal paragraph resume alone", () => {
    const prose = "Software engineer at Example Co. Built hiring systems for three years.\n".repeat(8);
    expect(textLooksColumnJumbled(prose)).toBe(false);
  });
});

describe("labelled resume fixtures", () => {
  it("counts every labelled job and skill, not just the first", () => {
    expect(recall(["Software Engineer", "Analyst"], ["Software Engineer"])).toBe(0.5);
    expect(recall(["React", "SQL"], ["React", "SQL"])).toBe(1);
    expect(recall([], ["React"])).toBeNull();
  });

  it("scores the redacted files when they exist", async () => {
    await mkdir(LABELLED_RESUME_DIR, { recursive: true });
    const result = await scoreLabelledResumes();
    expect(result.count).toBeGreaterThanOrEqual(0);
    if (result.count > 0) {
      expect(result.accuracy.titles === null || typeof result.accuracy.titles === "number").toBe(true);
    }
  });
});
