import { describe, expect, it } from "vitest";

import {
  certificationReviewList,
  fillEmptyProfileFromSuggestion,
  type ResumeSuggestion,
} from "@/lib/apply/resume-suggestion";
import { emptyStructuredDraft } from "@/lib/profiles/structured-profile";

const suggestion: ResumeSuggestion = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  skills: ["Mathematics"],
  experiences: [
    {
      title: "Engineer",
      company: "Analytical Engines",
      startDate: "Jan 1840",
      endDate: "Present",
      tenure: "",
    },
  ],
  education: [{ credential: "Mathematics", institution: "Home" }],
  projects: [{ name: "Difference Engine" }],
  certifications: ["Analytical Engine"],
};

describe("hosted apply certification suggestions", () => {
  it("lists suggested certifications and ignores blanks", () => {
    expect(certificationReviewList([" Analytical Engine ", "", "  "])).toEqual([
      "Analytical Engine",
    ]);
    expect(certificationReviewList(undefined)).toEqual([]);
  });

  it("keeps certifications out of the saved profile and fills only empty sections", () => {
    const draft = emptyStructuredDraft();
    draft.experiences[0] = {
      ...draft.experiences[0],
      title: "Poet",
      company: "Letters",
    };
    const filled = fillEmptyProfileFromSuggestion(draft, suggestion);
    expect(filled.experiences[0]?.title).toBe("Poet");
    expect(filled.education[0]?.degree).toBe("Mathematics");
    expect(filled.projects[0]?.name).toBe("Difference Engine");
    expect(filled).not.toHaveProperty("certifications");
  });

  it("does not replace education or projects the candidate already typed", () => {
    const draft = emptyStructuredDraft();
    draft.education[0] = { ...draft.education[0], school: "My school", degree: "BA" };
    draft.projects[0] = { ...draft.projects[0], name: "My project" };
    const filled = fillEmptyProfileFromSuggestion(draft, suggestion);
    expect(filled.education[0]?.school).toBe("My school");
    expect(filled.projects[0]?.name).toBe("My project");
  });
});
