import { describe, expect, it } from "vitest";

import { redactResumeFixture, scoreExtraction } from "@/lib/resumes/extraction-quality";
import { acceptResumeFields } from "@/lib/resumes/resume-fields";

describe("scoreExtraction", () => {
  it("accepts a resume-shaped text", () => {
    const quality = scoreExtraction(
      "Experience\nSenior engineer at Example. Education: BSc. Skills: TypeScript, hiring systems. ".repeat(
        8,
      ),
    );
    expect(quality.needsReview).toBe(false);
    expect(quality.hasResumeSignals).toBe(true);
  });

  it("flags a short garbled extract", () => {
    const quality = scoreExtraction("®©†µ ¶§ ¤");
    expect(quality.needsReview).toBe(true);
  });
});

describe("redactResumeFixture", () => {
  it("removes the top line and a parsed name, and keeps employer phrases", () => {
    const redacted = redactResumeFixture(
      [
        "Ada Lovelace ada@example.com +1 415 555 0199",
        "https://www.linkedin.com/in/ada",
        "12 MG Road, Bengaluru 560001",
        "PAN ABCDE1234F",
        "Aadhaar 2345 6789 0123",
        "Experience",
        "Machine Learning at Tata Consultancy Services",
        "Reference: Ada Lovelace",
      ].join("\n"),
      "Ada Lovelace",
    );
    expect(redacted).not.toContain("Ada");
    expect(redacted).not.toContain("ada@example.com");
    expect(redacted).not.toContain("415");
    expect(redacted).not.toContain("linkedin.com");
    expect(redacted).not.toContain("560001");
    expect(redacted).not.toContain("ABCDE1234F");
    expect(redacted).not.toContain("2345");
    expect(redacted).toContain("Experience");
    expect(redacted).toContain("Machine Learning");
    expect(redacted).toContain("Tata Consultancy Services");
    expect(redacted).toContain("[name]");
    expect(redacted).toContain("[aadhaar]");
    expect(redacted).toContain("[pan]");
  });
});

describe("acceptResumeFields", () => {
  const source = "Ada Lovelace\nExperience\nEngineer at Analytical Engines";

  it("keeps fields whose quotes appear in the resume", () => {
    const result = acceptResumeFields(
      {
        fullName: { value: "Ada Lovelace", quote: "Ada Lovelace" },
        email: null,
        phone: null,
        skills: [],
        experience: [
          {
            title: { value: "Engineer", quote: "Engineer at Analytical Engines" },
            organization: { value: "Analytical Engines", quote: "Analytical Engines" },
            startDate: null,
            endDate: null,
          },
        ],
        education: [],
        certifications: [],
        projects: [],
      },
      source,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects extra fields and quotes the model invented", () => {
    expect(
      acceptResumeFields(
        {
          fullName: { value: "Ada", quote: "Ada Lovelace" },
          email: null,
          phone: null,
          skills: [],
          experience: [],
          education: [],
          certifications: [],
          projects: [],
          confidence: 0.9,
        },
        source,
      ),
    ).toEqual({ ok: false, reason: "INVALID_SHAPE" });

    expect(
      acceptResumeFields(
        {
          fullName: { value: "Ada", quote: "Not in the resume" },
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
