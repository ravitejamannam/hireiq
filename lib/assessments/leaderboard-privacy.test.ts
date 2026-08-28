import { describe, expect, it } from "vitest";

import {
  toHiringLeaderboardName,
  toPublicLeaderboardName,
} from "@/lib/assessments/leaderboard-privacy";

describe("leaderboard name privacy", () => {
  it("shows first name and last initial on the public board", () => {
    expect(toPublicLeaderboardName("Priya Sharma")).toBe("Priya S.");
    expect(toPublicLeaderboardName("AZ Test")).toBe("AZ T.");
  });

  it("does not publish emails or empty names", () => {
    expect(toPublicLeaderboardName("az.test@example.com")).toBe("Candidate");
    expect(toPublicLeaderboardName("   ")).toBe("Candidate");
  });

  it("keeps a single given name", () => {
    expect(toPublicLeaderboardName("Madonna")).toBe("Madonna");
  });

  it("keeps the full name for the hiring team", () => {
    expect(toHiringLeaderboardName("Priya Sharma")).toBe("Priya Sharma");
  });
});
