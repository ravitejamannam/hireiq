import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { copilotActorFromUser, copilotJobAllowed } from "@/lib/copilot/policy";
import {
  actionNeedsConfirmation,
  answerWithCitations,
  copilotShortcutBlocked,
  draftMessage,
  formatCandidateSearch,
  manualReviewListing,
  pastCandidateHint,
  requirementMatchesSkill,
  protectedQuestion,
  refusalForProtectedQuestion,
} from "@/lib/copilot/policy";

describe("copilot grounding", () => {
  it("refuses a protected-attribute question", () => {
    expect(protectedQuestion("Rank the women for this role")).toBe(true);
    expect(protectedQuestion("Top 5 for Kubernetes")).toBe(false);
    expect(refusalForProtectedQuestion()).toMatch(/can't rank or filter/);
  });

  it("rejects an answer whose citation is not in the stored text", () => {
    const result = answerWithCitations({
      answer: "Priya knows Rust.",
      citations: [{ label: "Match", quote: "Rust", href: "/dashboard/jobs/1/review?selected=1" }],
      corpus: ["Go · Postgres · Kubernetes"],
    });
    expect(result.answer).toBe("I couldn't verify that.");
    expect(result.citations).toEqual([]);
  });

  it("keeps a citation that is copied from the source", () => {
    const result = answerWithCitations({
      answer: "Priya matches Kubernetes.",
      citations: [{ label: "Priya Raghavan", quote: "Kubernetes", href: "/dashboard/jobs/1/review?selected=1" }],
      corpus: ["Go · Postgres · Kubernetes"],
    });
    expect(result.citations).toHaveLength(1);
  });

  it("does not import the self-id table or send mail from a draft", () => {
    const service = readFileSync(new URL("./copilot-service.ts", import.meta.url), "utf8");
    expect(service).not.toMatch(/CandidateSelfIdentification|fairness\/self-id|sendOutboundEmail/);
    expect(manualReviewListing("Asha")).toBe("Asha: Manual review");
    const draft = draftMessage({ name: "Priya", purpose: "rejection", jobTitle: "Backend" });
    expect(draft.sent).toBe(false);
    expect(draft.draft).toMatch(/has not been sent/);
    expect(actionNeedsConfirmation({ kind: "shortlist", label: "Shortlist", applicationIds: [1], draft: null, confirmed: false })).toBe(true);
  });

  it("says when a skill search has fewer than five current applicants", () => {
    const answer = formatCandidateSearch({
      skill: "Kubernetes",
      ranked: [{ name: "Priya Raghavan", coverage: 0.58 }],
      manual: [],
    });
    expect(answer).toMatch(/1 match on this job's current applicants, fewer than 5/);
    expect(answer).toMatch(/Priya Raghavan \(58%\)/);
    expect(formatCandidateSearch({
      skill: "Kubernetes",
      ranked: Array.from({ length: 5 }, (_, index) => ({ name: `Person ${index}`, coverage: 1 })),
      manual: [],
    })).not.toMatch(/fewer than 5/);
  });

  it("counts past candidates by the matcher skill name and links only when there are more", () => {
    expect(requirementMatchesSkill({ skill: "Kubernetes", key: "primarySkills:kubernetes", quote: "Kubernetes", result: "SATISFIED" })).toBe(true);
    expect(requirementMatchesSkill({ skill: "Go", key: "primarySkills:go", quote: "golang", result: "SATISFIED" })).toBe(true);
    expect(requirementMatchesSkill({ skill: "Kubernetes", key: "primarySkills:k8s", quote: "k8s", result: "SATISFIED" })).toBe(true);
    expect(requirementMatchesSkill({ skill: "Kubernetes", key: "primarySkills:kubernetes", quote: "Kubernetes", result: "UNKNOWN" })).toBe(false);
    expect(pastCandidateHint(3)).toBe("3 more in past candidates");
    expect(pastCandidateHint(0)).toBeNull();
  });

  it("does not treat a recruiter as an admin, and blocks another company's job", () => {
    const recruiter = copilotActorFromUser({ id: 1, role: "CLIENT", companyId: 4, interviewerId: null });
    expect(recruiter.role).toBe("CLIENT");
    expect(copilotJobAllowed({ actor: recruiter, jobCompanyId: 5, assignedInterviewerId: null })).toBe(false);
    expect(copilotJobAllowed({ actor: recruiter, jobCompanyId: 4, assignedInterviewerId: null })).toBe(true);
    const interviewer = copilotActorFromUser({ id: 2, role: "INTERVIEWER", companyId: null, interviewerId: 9 });
    expect(copilotJobAllowed({ actor: interviewer, jobCompanyId: 5, assignedInterviewerId: 3 })).toBe(false);
    expect(copilotJobAllowed({ actor: interviewer, jobCompanyId: 4, assignedInterviewerId: 9 })).toBe(true);
  });

  it("ignores the C shortcut while a text field is focused", () => {
    expect(copilotShortcutBlocked({ tagName: "INPUT" })).toBe(true);
    expect(copilotShortcutBlocked({ tagName: "TEXTAREA" })).toBe(true);
    expect(copilotShortcutBlocked({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(copilotShortcutBlocked({ tagName: "DIV", getAttribute: () => "textbox" })).toBe(true);
    expect(copilotShortcutBlocked({ tagName: "BUTTON" })).toBe(false);
    expect(copilotShortcutBlocked(null)).toBe(false);
  });
});
