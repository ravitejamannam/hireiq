import { describe, expect, it } from "vitest";

import { canonicalDegree, degreesMatch } from "@/lib/resumes/degree-canonical";
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
    expect(canonicalDegree("BCA")).toBe("BCA");
    expect(canonicalDegree("PGDM")).toBe("PGDM");
    expect(canonicalDegree("Diploma in Mechanical")).toBe("Diploma");
    expect(canonicalDegree("ITI")).toBe("ITI");
    expect(canonicalDegree("SSC")).toBe("10th");
    expect(canonicalDegree("Intermediate")).toBe("12th");
    expect(degreesMatch("Cao đẳng Quản trị kinh doanh", "Cao đẳng Ngành Quản Trị Kinh Doanh Tổng Hợp")).toBe(true);
    expect(degreesMatch("B.Tech", "M.Tech")).toBe(false);
  });

  it("treats TCS and Tata Consultancy Services as the same employer", () => {
    expect(canonicalEmployer("Tata Consultancy Services")).toBe("TCS");
    expect(employersMatch("TCS", "Tata Consultancy Services Ltd")).toBe(true);
    expect(employersMatch("Infosys Ltd", "Infosys Limited")).toBe(true);
    expect(canonicalEmployer("LTI")).toBe("LTIMindtree");
    expect(canonicalEmployer("Peekay Buildtech")).toBeNull();
  });
});
