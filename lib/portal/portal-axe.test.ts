import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { PortalApplicationView, PortalHomeView, PortalLoginView } from "@/components/portal/PortalViews";

async function seriousViolations(html: string) {
  const dom = new JSDOM(`<!doctype html><html lang="en"><head><title>Portal</title></head><body>${html}</body></html>`);
  const { window } = dom;
  const globals = globalThis as typeof globalThis & {
    window: typeof window;
    document: Document;
    Node: typeof window.Node;
    Element: typeof window.Element;
    HTMLElement: typeof window.HTMLElement;
  };
  globals.window = window as typeof globals.window;
  globals.document = window.document;
  globals.Node = window.Node;
  globals.Element = window.Element;
  globals.HTMLElement = window.HTMLElement;
  try {
    const axe = (await import("axe-core")).default;
    const results = await axe.run({
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
    });
    return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  } finally {
    dom.window.close();
  }
}

const application = {
  id: 4,
  job: "Senior Backend Engineer",
  company: "Nimbus Labs",
  stage: "Technical evaluation",
  notice: "A person reviews AI notes. You can opt out.",
  optedOut: false,
  humanReview: false,
  withdrawn: false,
  unsubscribed: false,
  deletionQueued: false,
  futureRoles: false,
  timeline: [{ at: "2026-10-01T00:00:00.000Z", label: "Applied" }],
  nextAction: "Take assessment" as const,
  interviews: [{ id: 9, at: "2026-10-20T04:30:00.000Z", type: "TECHNICAL", meetUrl: "https://meet.example/abc", past: false }],
  assessments: [{ deadline: "2026-10-21T12:30:00.000Z", limit: "45 minutes", submittedAt: null }],
  documents: [{ fileName: "cv.pdf", kind: "RESUME", message: "We read this file." }],
  error: null,
};

describe("portal axe", () => {
  it("has no serious violations on login, home, or application", async () => {
    const pages = [
      renderToStaticMarkup(createElement(PortalLoginView, { error: null, sent: false })),
      renderToStaticMarkup(createElement(PortalHomeView, {
        email: "ada@example.com",
        cards: [{ id: 4, job: "Senior Backend Engineer", company: "Nimbus Labs", stage: "Technical evaluation", nextAction: "Take assessment", href: "/portal/applications/4" }],
      })),
      renderToStaticMarkup(createElement(PortalApplicationView, application)),
    ];
    for (const html of pages) {
      expect(await seriousViolations(html)).toEqual([]);
    }
  });
});
