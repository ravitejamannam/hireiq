import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "app/actions/job-actions.ts"),
  "utf8",
);

function exportBody(name: string) {
  const start = source.indexOf(`export async function ${name}(`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("createJob cache invalidation", () => {
  it("revalidates the requirements list and the jobs list after creation", () => {
    const createJob = exportBody("createJob");
    const helperStart = source.indexOf("function revalidateClientRequirementPaths");
    const helperEnd = source.indexOf("export async function createClientRequirement");
    const helper = source.slice(helperStart, helperEnd);

    expect(createJob).toContain("revalidateClientRequirementPaths(job.id)");
    expect(helper).toContain('revalidatePath("/dashboard/jobs")');
    expect(helper).toContain('revalidatePath("/dashboard/requirements")');
  });
});
