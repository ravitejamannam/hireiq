/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScreeningRow } from "@/lib/screening/screening-data";
import type { PoolSummary } from "@/lib/screening/prioritization";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/review-queue-actions", () => ({
  approveReviewCloseOut: vi.fn(),
  bulkReviewApplications: vi.fn(),
  cancelReviewCloseOut: vi.fn(),
  decideReviewApplication: vi.fn(),
  proposeReviewCloseOut: vi.fn(),
  runReviewAnalysis: vi.fn(),
}));

vi.mock("@/app/actions/screening-actions", () => ({
  assignPracticalTask: vi.fn(),
  inviteToWalkthrough: vi.fn(),
  sendBasicAssessment: vi.fn(),
}));

import ReviewQueue from "@/components/review/ReviewQueue";

const summary = {
  policyVersion: null,
  capacityNote: null,
  viewCounts: { top: 0, possible: 0, weak: 0, not_met: 0, needs_info: 0, assessment: 0, practical: 0, all: 0 },
} as PoolSummary;

function row(id: number, name: string): ScreeningRow {
  const component = { percent: null, comparable: true, status: "NOT_INVITED", weight: 0, threshold: null };
  return {
    applicationId: id,
    name,
    title: null,
    currentEmployer: null,
    status: "CV_POOL",
    closed: false,
    appliedAt: "2026-03-15T00:00:00.000Z",
    optedOut: false,
    humanReview: true,
    knockout: "none",
    parseIssue: false,
    basicSource: null,
    generatedInviteId: null,
    practicalId: null,
    requirementsApproved: false,
    evaluation: {
      applicationId: id,
      components: { basic: component, practical: { ...component, status: "NOT_ASSIGNED" }, evidence: { ...component, status: "NOT_ANALYSED" } },
      combined: null,
      missing: [],
      standard: "INCOMPLETE",
      eligibility: "UNVERIFIED",
      confidence: "LOW",
      flags: [],
      rank: null,
      priority: false,
      category: "NEEDS_INFO",
      nextAction: "Review the application",
      views: ["all"],
      completeness: { present: 0, required: 0 },
    },
  };
}

function detail(id: number, name: string) {
  return {
    id,
    name,
    title: null,
    company: null,
    skills: null,
    location: null,
    status: "CV_POOL",
    optedOut: false,
    humanReview: true,
    resume: null,
    requirements: [],
    screeningAnswers: [],
    interviewFeedback: [],
    decisions: [],
  };
}

function queue(overrides: Partial<ComponentProps<typeof ReviewQueue>> = {}) {
  return (
    <ReviewQueue
      jobId={9}
      jobTitle="Fixture Backend Engineer"
      rows={[]}
      summary={summary}
      detail={null}
      page={1}
      pageCount={1}
      total={0}
      view="top"
      query=""
      truncated={false}
      evidenceSource="MATCHER_V1"
      hasPublishedAssessment={false}
      hasPractical={false}
      {...overrides}
    />
  );
}

describe("ReviewQueue acknowledgement reset", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  function mount(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(node));
  }

  it("renders an empty review list without updating forever", () => {
    mount(queue());
    expect(document.querySelector("h1")?.textContent).toBe("Fixture Backend Engineer");
    expect(document.body.textContent).toContain("0 in this view");
    expect(document.body.textContent).toContain("No candidates in this view.");
  });

  it("clears a human-review acknowledgement when the selected candidate changes", () => {
    const first = row(11, "First candidate");
    const second = row(12, "Second candidate");
    mount(queue({ rows: [first, second], detail: detail(11, "First candidate"), total: 2, view: "all" }));
    const box = [...document.querySelectorAll("input")].find((input) => input.getAttribute("aria-label") === "Acknowledge the candidate's human-review request") as HTMLInputElement | undefined;
    expect(box?.checked).toBe(false);
    act(() => box?.click());
    expect(box?.checked).toBe(true);
    act(() => {
      document.querySelectorAll("button").forEach((button) => {
        if (button.textContent?.includes("Second candidate")) button.click();
      });
    });
    const after = [...document.querySelectorAll("input")].find((input) => input.getAttribute("aria-label") === "Acknowledge the candidate's human-review request") as HTMLInputElement | undefined;
    expect(after?.checked).toBe(false);
  });
});
