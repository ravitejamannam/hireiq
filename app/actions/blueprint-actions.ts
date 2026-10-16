"use server";

import { revalidatePath } from "next/cache";

import {
  AuthenticationError,
  requireAdmin,
  requireApplicationAccess,
  requireEvaluationAccess,
  requireInterviewerPortal,
} from "@/lib/auth/authorization";
import {
  BlueprintError,
  copyBlueprintForAdmin,
  getActiveBlueprintForApplication,
  getBlueprintForSpec,
  getRubricScoresForEvaluation,
  listBlueprintSourceOptions,
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
    await requireInterviewerPortal();
    await requireApplicationAccess(applicationId);
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

export async function loadRubricScores(evaluationId: number) {
  try {
    await requireInterviewerPortal();
    await requireEvaluationAccess(evaluationId);
    return { ok: true as const, scores: await getRubricScoresForEvaluation(evaluationId) };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}

export async function getBlueprintCopySources() {
  try {
    await requireAdmin();
    return { ok: true as const, sources: await listBlueprintSourceOptions() };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}

export async function copyBlueprintFromRequirement(input: {
  sourceSpecVersionId: unknown;
  targetSpecVersionId: unknown;
}) {
  try {
    const blueprint = await copyBlueprintForAdmin({
      sourceSpecVersionId: input.sourceSpecVersionId,
      targetSpecVersionId: input.targetSpecVersionId,
    });
    revalidatePath(`/dashboard/requirements/${input.targetSpecVersionId}`);
    revalidatePath(`/dashboard/requirements/${input.targetSpecVersionId}/blueprint`);
    return { ok: true as const, blueprint };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return { ok: false as const, error: blueprintActionErrorMessage(error) };
  }
}
