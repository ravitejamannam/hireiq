import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobDescriptionAiView } from "@/components/client/JobDescriptionAiView";

function markup(status: "NONE" | "GENERATING" | "FAILED" | "READY") {
  return renderToStaticMarkup(
    createElement(JobDescriptionAiView, {
      status,
      error: status === "FAILED" ? "provider down" : null,
      currentJobDescription: "Current description",
      proposedText: status === "READY" ? "Proposed description with TypeScript" : null,
      onGenerate: () => undefined,
      onAccept: () => undefined,
      onDiscard: () => undefined,
    }),
  );
}

describe("JobDescriptionAiView", () => {
  it("moves from generate to generating, then ready with accept and discard", () => {
    expect(markup("NONE")).toContain("Generate with AI");
    expect(markup("NONE")).not.toContain("Accept");

    const generating = markup("GENERATING");
    expect(generating).toContain("Generating…");
    expect(generating).toContain("disabled");

    const failed = markup("FAILED");
    expect(failed).toContain("provider down");
    expect(failed).toContain("Retry");

    const ready = markup("READY");
    expect(ready).toContain("Proposed description with TypeScript");
    expect(ready).toContain("Accept");
    expect(ready).toContain("Discard");
  });
});
