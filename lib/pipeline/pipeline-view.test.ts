import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ApplicationPipelineStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  PIPELINE_COLUMNS,
  PIPELINE_LOADING_MESSAGE,
  applicationsForRequirement,
} from "@/lib/pipeline/pipeline-view";

const clientSource = readFileSync(
  join(process.cwd(), "components/pipeline/PipelineClient.tsx"),
  "utf8",
);

describe("pipeline initial render", () => {
  it("shows a loading message instead of an empty suspense fallback", () => {
    expect(PIPELINE_LOADING_MESSAGE.trim().length).toBeGreaterThan(0);
    expect(PIPELINE_LOADING_MESSAGE.toLowerCase()).not.toContain("no applications");
    expect(clientSource).toContain("PIPELINE_LOADING_MESSAGE");
    expect(clientSource).toContain('role="status"');
    expect(clientSource).not.toContain("fallback={null}");
  });

  it("keeps the pipeline status columns for the resolved board", () => {
    expect(PIPELINE_COLUMNS).toEqual([
      ApplicationPipelineStatus.CV_POOL,
      ApplicationPipelineStatus.EXPERT_REVIEW,
      ApplicationPipelineStatus.TECH_EVALUATION,
      ApplicationPipelineStatus.SHORTLISTED,
      ApplicationPipelineStatus.SELECTED,
      ApplicationPipelineStatus.HIRED,
      ApplicationPipelineStatus.REJECTED,
    ]);
    expect(clientSource).toContain("PIPELINE_COLUMNS");
  });

  it("filters the board to the requirement in the query", () => {
    const applications = [
      { id: 1, jobId: 10 },
      { id: 2, jobId: 20 },
      { id: 3, jobId: 10 },
    ];

    expect(applicationsForRequirement(applications, 10).map((row) => row.id)).toEqual([
      1, 3,
    ]);
    expect(applicationsForRequirement(applications, null)).toEqual(applications);
  });
});
