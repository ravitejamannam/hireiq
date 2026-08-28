import { describe, expect, it } from "vitest";

import {
  applySocialRows,
  detectPlatformFromUrl,
  listSocialRows,
  parseBulkSocialLinks,
} from "@/lib/profiles/social-platforms";

describe("social platforms", () => {
  it("detects common hosts including twitter aliases", () => {
    expect(detectPlatformFromUrl("https://github.com/ravitejamannam")).toBe("GITHUB");
    expect(detectPlatformFromUrl("linkedin.com/in/ravi")).toBe("LINKEDIN");
    expect(detectPlatformFromUrl("https://x.com/ravi")).toBe("TWITTER");
    expect(detectPlatformFromUrl("https://dev.to/ravi")).toBe("DEVTO");
    expect(detectPlatformFromUrl("https://example.com")).toBe("PORTFOLIO");
  });

  it("parses bulk URLs without dropping in-progress empty rows later", () => {
    const links = parseBulkSocialLinks(
      "https://github.com/ravi\nhttps://leetcode.com/ravi\nhttps://medium.com/@ravi",
    );
    expect(links.map((link) => link.platform)).toEqual([
      "GITHUB",
      "LEETCODE",
      "MEDIUM",
    ]);
  });

  it("keeps empty URL rows so the Socials editor can add platforms", () => {
    const applied = applySocialRows([
      { platform: "LINKEDIN", url: "" },
      { platform: "GITHUB", url: "https://github.com/ravi" },
    ]);
    expect(applied.githubUrl).toBe("https://github.com/ravi");
    expect(applied.socialLinks).toEqual([{ platform: "LINKEDIN", url: "" }]);
    const rows = listSocialRows(applied);
    expect(rows.some((row) => row.platform === "LINKEDIN")).toBe(true);
    expect(rows.some((row) => row.platform === "GITHUB")).toBe(true);
  });
});
