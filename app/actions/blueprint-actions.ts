"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError, requireAdmin } from "@/lib/auth/authorization";
import {
  BlueprintError,
  getActiveBlueprintForApplication,
  getBlueprintForSpec,
  getRubricScoresForEvaluation,
  saveRubricScoresForInterviewer,
  upsertBlueprintForSpec,
} from "@/lib/interviews/blueprint-service";

function blueprintActionErrorMessage(error: unknown): string {
  if (error instanceof BlueprintError) return error.message;
  return "Blueprint action failed. Please try again.";
}

export async function getBlueprintForSpecification(specVersionId: unknown) {
  try {
    await requireAdmin();
    return { ok: true as const, blueprint: await getBlueprintForSpec(Number(specVersionId)) };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}

export async function saveBlueprint(input: {
  specVersionId: unknown;
  competencies: unknown;
  questions: unknown;
}) {
  try {
    const blueprint = await upsertBlueprintForSpec({
      actorIsAdminVerified: true,
      specVersionId: input.specVersionId,
      competencies: input.competencies,
      questions: input.questions,
    });
    revalidatePath("/dashboard/requirements");
    if (typeof input.specVersionId === "number") {
      revalidatePath(`/dashboard/requirements/${input.specVersionId}`);
      revalidatePath(`/dashboard/requirements/${input.specVersionId}/blueprint`);
    }
    return { ok: true as const, blueprint };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}

export async function getInterviewRubric(applicationId: number) {
  try {
    await requireInterviewerPortalCompat();
    const blueprint = await getActiveBlueprintForApplication(applicationId);
    return { ok: true as const, blueprint };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}

export async function saveInterviewRubricScores(
  applicationId: number,
  evaluationId: number,
  scores: unknown,
) {
  try {
    const result = await saveRubricScoresForInterviewer(applicationId, evaluationId, scores);
    revalidatePath("/interviewer");
    revalidatePath(`/interviewer/evaluations`);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}

async function requireInterviewerPortalCompat() {
  // Local import keeps this action file's dependency graph identical to
  // evaluation-actions.ts patterns.
  const { requireInterviewerPortal } = await import("@/lib/auth/authorization");
  return requireInterviewerPortal();
}

// re-export for client components that need existing score reads
export async function loadRubricScores(evaluationId: number) {
  try {
    await requireInterviewerPortalCompat();
    return { ok: true as const, scores: await getRubricScoresForEvaluation(evaluationId) };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}
