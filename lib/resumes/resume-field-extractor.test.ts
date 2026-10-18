import { describe, expect, it } from "vitest";

import { heuristicResumeFields, suggestionFromFields } from "@/lib/resumes/resume-field-extractor";
import { acceptResumeFields } from "@/lib/resumes/resume-fields";
import { createParseControl } from "@/lib/resumes/text-extraction";

describe("heuristicResumeFields", () => {
  it("returns only values that appear in the resume", () => {
    const source = [
      "Ada Lovelace",
      "ada@example.com",
      "Skills: Analysis, Mathematics",
      "Engineer at Analytical Engines",
      "Education: Mathematics",
      "Certification: Analytical Engine",
      "Project: Difference Engine",
    ].join("\n");
    const fields = heuristicResumeFields(source);
    expect(fields?.fullName?.value).toBe("Ada Lovelace");
    expect(fields?.email?.value).toBe("ada@example.com");
    expect(fields?.phone).toBeNull();
    expect(fields?.skills.map((skill) => skill.value)).toEqual(["Analysis", "Mathematics"]);
    expect(fields?.experience[0]?.title.value).toBe("Engineer");
    expect(fields?.experience[0]?.startDate).toBeNull();
    expect(fields?.education[0]?.credential.value).toBe("Mathematics");
    expect(fields?.certifications[0]?.value).toBe("Analytical Engine");
    expect(fields?.projects[0]?.name.value).toBe("Difference Engine");
    expect(fields && suggestionFromFields(fields)).toMatchObject({
      fullName: "Ada Lovelace",
      certifications: ["Analytical Engine"],
      projects: [{ name: "Difference Engine" }],
    });
  });

  it("reads an Indeed title line, the company line under it, and an Indian degree", () => {
    const source = [
      "Work Experience",
      "Senior Consultant",
      "Northwind Labs",
      "January 2019 to March 2022",
      "Education",
      "B.Sc. in Computer Science",
    ].join("\n");
    const fields = heuristicResumeFields(source);
    expect(fields?.experience[0]?.title.value).toBe("Senior Consultant");
    expect(fields?.experience[0]?.organization?.value).toBe("Northwind Labs");
    expect(fields?.education.some((row) => row.credential.value === "B.Sc")).toBe(true);
  });

  it("does not invent a name or change the source text", () => {
    const source = "skills: nothing written as a person\nworked somewhere";
    const snapshot = source;
    const fields = heuristicResumeFields(source);
    expect(fields?.fullName).toBeNull();
    expect(fields?.experience).toEqual([]);
    expect(source).toBe(snapshot);
  });
});

describe("acceptResumeFields contract", () => {
  const source = "Ada Lovelace\nCertification: Analytical Engine\nProject: Difference Engine";

  it("accepts every supported field when each quote is in the resume", () => {
    const raw = {
      fullName: { value: "Ada Lovelace", quote: "Ada Lovelace" },
      email: null,
      phone: null,
      skills: [],
      experience: [],
      education: [],
      certifications: [{ value: "Analytical Engine", quote: "Analytical Engine" }],
      projects: [{ name: { value: "Difference Engine", quote: "Difference Engine" } }],
    };
    const result = acceptResumeFields(raw, source);
    expect(result.ok).toBe(true);
    expect(raw.certifications[0]?.value).toBe("Analytical Engine");
  });

  it("allows empty optional collections", () => {
    expect(
      acceptResumeFields(
        {
          fullName: null,
          email: null,
          phone: null,
          skills: [],
          experience: [],
          education: [],
          certifications: [],
          projects: [],
        },
        source,
      ).ok,
    ).toBe(true);
  });

  it("rejects a missing required collection and an invented quote", () => {
    expect(
      acceptResumeFields(
        {
          fullName: null,
          email: null,
          phone: null,
          skills: [],
          experience: [],
          education: [],
        },
        source,
      ),
    ).toEqual({ ok: false, reason: "INVALID_SHAPE" });
    expect(
      acceptResumeFields(
        {
          fullName: { value: "Ada", quote: "Not written" },
          email: null,
          phone: null,
          skills: [],
          experience: [],
          education: [],
          certifications: [],
          projects: [],
        },
        source,
      ),
    ).toEqual({ ok: false, reason: "UNGROUNDED_QUOTE" });
  });
});

describe("createParseControl", () => {
  it("marks the parse aborted so a timeout can stop the worker", () => {
    const control = createParseControl();
    expect(control.aborted).toBe(false);
    control.stop();
    expect(control.aborted).toBe(true);
  });
});
