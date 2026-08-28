import { describe, expect, it } from "vitest";

import {
  collectStructuredProfile,
  isPersonProfilePublished,
  profileCompletenessPercent,
  skillsTextFromProfile,
} from "@/lib/profiles/structured-profile";

describe("structured profile validation", () => {
  it("accepts empty optional career sections", () => {
    const fields: Record<string, string> = {};
    const payload = collectStructuredProfile({}, fields);
    expect(fields).toEqual({});
    expect(payload.experiences).toEqual([]);
    expect(payload.domains).toEqual([]);
  });

  it("rejects more than three domains and unknown labels", () => {
    const fields: Record<string, string> = {};
    collectStructuredProfile(
      { domains: ["Engineering", "Design", "Product", "Sales"] },
      fields,
    );
    expect(fields.domains).toMatch(/up to 3/i);

    const unknown: Record<string, string> = {};
    collectStructuredProfile({ domains: ["Astrology"] }, unknown);
    expect(unknown.domains).toMatch(/invalid/i);
  });

  it("drops blank experience rows and requires title + company when present", () => {
    const fields: Record<string, string> = {};
    const payload = collectStructuredProfile(
      {
        experiences: [
          {
            title: "",
            company: "",
            startDate: "",
            endDate: "",
            isCurrent: false,
            location: "",
            summary: "",
          },
          {
            title: "Engineer",
            company: "",
            startDate: "2024",
            endDate: "",
            isCurrent: true,
            location: "",
            summary: "",
          },
        ],
      },
      fields,
    );
    expect(payload.experiences).toHaveLength(1);
    expect(fields["experiences.1"]).toMatch(/Role and company/i);
  });

  it("computes completeness in eighths", () => {
    expect(
      profileCompletenessPercent({
        name: "Ravi",
        location: "Bengaluru",
        roleTitle: "",
        aboutText: "",
        domains: [],
        experiences: [],
        education: [],
        linkedInUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      }),
    ).toBe(25);
  });

  it("joins domains and project tech into skills text", () => {
    const fields: Record<string, string> = {};
    const payload = collectStructuredProfile(
      {
        domains: ["Engineering", "Data Science"],
        projects: [
          {
            name: "HireIQ",
            url: "",
            technologies: "TypeScript, Postgres",
            summary: "",
          },
        ],
      },
      fields,
    );
    expect(skillsTextFromProfile(payload)).toBe(
      "Engineering, Data Science, TypeScript, Postgres",
    );
  });

  it("promotes GitHub and LeetCode social rows onto canonical URLs", () => {
    const fields: Record<string, string> = {};
    const payload = collectStructuredProfile(
      {
        socialLinks: [
          { platform: "GITHUB", url: "https://github.com/ravitejamannam" },
          { platform: "LEETCODE", url: "https://leetcode.com/ravitejamannam" },
          { platform: "MEDIUM", url: "https://medium.com/@ravi" },
        ],
      },
      fields,
    );
    expect(fields).toEqual({});
    expect(payload.githubUrl).toBe("https://github.com/ravitejamannam");
    expect(payload.leetcodeUrl).toBe("https://leetcode.com/ravitejamannam");
    expect(payload.socialLinks).toEqual([
      { platform: "MEDIUM", url: "https://medium.com/@ravi" },
    ]);
  });

  it("treats a role or experience as a published profile page", () => {
    expect(
      isPersonProfilePublished({
        roleTitle: "Fullstack Engineer",
        aboutText: "",
        experiences: [],
        education: [],
        githubUrl: null,
        linkedInUrl: null,
      }),
    ).toBe(true);
    expect(
      isPersonProfilePublished({
        roleTitle: "",
        aboutText: "",
        experiences: [],
        education: [],
        githubUrl: null,
        linkedInUrl: null,
      }),
    ).toBe(false);
  });
});
