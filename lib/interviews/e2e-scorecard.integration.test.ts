import "@/lib/evidence-graph/evidence-graph-test-env";

import { describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import { submitRubricScorecard } from "@/app/actions/evaluation-actions";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";
import { prisma } from "@/lib/prisma";

describe("hidden scorecards on the fresh Nimbus job", () => {
  it.skipIf(!process.env.DATABASE_URL?.includes("hireiq_e2e_full"))("hides the other scorecard until this interviewer submits", async () => {
    const interviewer = await prisma.user.findFirstOrThrow({
      where: { email: "interviewer1.nimbus@e2e.hireiq.local" },
      select: { id: true, interviewerId: true },
    });
    const other = await prisma.user.findFirstOrThrow({
      where: { email: "interviewer2.nimbus@e2e.hireiq.local" },
      select: { interviewerId: true },
    });
    const application = await prisma.application.findFirstOrThrow({
      where: { candidate: { name: "nimbus Applicant 8" }, job: { title: "Nimbus Labs: Backend Engineer" } },
      select: { id: true },
    });
    if (!interviewer.interviewerId || !other.interviewerId) throw new Error("missing interviewer");
    await prisma.evaluation.deleteMany({ where: { applicationId: application.id } });
    await prisma.evaluation.create({
      data: {
        applicationId: application.id,
        interviewerId: other.interviewerId,
        overallScore: 5,
        notes: "Other interviewer notes",
        submittedAt: new Date(),
      },
    });
    const before = await prisma.evaluation.findMany({
      where: { applicationId: application.id },
      select: { interviewerId: true, submittedAt: true, notes: true },
    });
    const hidden = visibleScorecards({ viewerInterviewerId: interviewer.interviewerId, cards: before });
    expect(hidden.map((card) => card.notes)).toEqual([]);

    actor.id = String(interviewer.id);
    await submitRubricScorecard({
      applicationId: application.id,
      scores: [{ criterion: "Overall", score: 4 }],
      notes: "Clear on the Kubernetes tradeoff.",
    });

    const after = await prisma.evaluation.findMany({
      where: { applicationId: application.id },
      select: { interviewerId: true, submittedAt: true, notes: true },
    });
    const visible = visibleScorecards({ viewerInterviewerId: interviewer.interviewerId, cards: after });
    expect(visible.map((card) => card.notes).sort()).toEqual(["Clear on the Kubernetes tradeoff.", "Other interviewer notes"]);
  });
});
