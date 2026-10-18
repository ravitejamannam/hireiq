import { describe, expect, it } from "vitest";

import { canonicalDegree } from "@/lib/resumes/degree-canonical";
import { canonicalEmployer, employersMatch } from "@/lib/resumes/employer-aliases";
import { labelsMatch } from "@/lib/resumes/labelled-fixtures";

describe("Indian degree and employer names", () => {
  it("maps written-out degrees and abbreviations to one form", () => {
    expect(canonicalDegree("Bachelor of Technology")).toBe("B.Tech");
    expect(canonicalDegree("BTech")).toBe("B.Tech");
    expect(canonicalDegree("B.Sc. in Computer Science")).toBe("B.Sc");
    expect(canonicalDegree("Bachelor of Enginerring in Information Technology")).toBe("B.E");
    expect(labelsMatch("Bachelor of Technology in Computer Science", "B.Tech")).toBe(true);
    expect(canonicalDegree("to be considered")).toBeNull();
  });

  it("treats TCS and Tata Consultancy Services as the same employer", () => {
    expect(canonicalEmployer("Tata Consultancy Services")).toBe("TCS");
    expect(employersMatch("TCS", "Tata Consultancy Services Ltd")).toBe(true);
    expect(employersMatch("Infosys Ltd", "Infosys Limited")).toBe(true);
  });
});
