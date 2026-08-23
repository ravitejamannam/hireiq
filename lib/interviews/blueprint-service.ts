import { JobSpecificationVersionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireInterviewerPortal } from "@/lib/auth/authorization";
import { AuthorizationError } from "@/lib/auth/authorization";

/**
 * Structured Interview Kit (T98 Phase 7).
 *
 * A blueprint is a rubric attached to a PUBLISHED job specification
 * version: competencies with weights, plus tagged questions. Interviewers
 * must score every competency; scores are snapshotted (name + weight
 * copied at save time) so later rubric edits never rewrite history (§6).
 *
 * Enforcement philosophy: the rubric gates COMPLETENESS of competency
 * scoring. Existing Evaluation semantics are untouched (§46 frozen).
 */

export class BlueprintError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const MAX_COMPETENCIES = 12;
const MAX_QUESTIONS = 40;

export type BlueprintCompetencyInput = {
  name: unknown;
  description?: unknown;
  weight: unknown;
};

export type BlueprintQuestionInput = {
  competencyName: unknown;
  question: unknown;
  guidance?: unknown;
  difficulty?: unknown;
};

export type SafeBlueprint = {
  id: number;
  jobSpecificationVersionId: number;
  version: number;
  active: boolean;
  competencies: Array<{
    id: number;
    name: string;
    description: string | null;
    weight: number;
    questions: Array<{
      id: number;
      question: string;
      guidance: string | null;
      difficulty: string | null;
      active: boolean;
    }>;
  }>;
};

// ---------- reads ----------

export async function getBlueprintForSpec(specVersionId: number): Promise<SafeBlueprint | null> {
  const row = await prisma.interviewBlueprint.findUnique({
    where: { jobSpecificationVersionId: specVersionId },
    include: {
      competencies: {
        orderBy: { sortOrder: "asc" },
        include: { questions: { orderBy: { id: "asc" } } },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    version: row.version,
    active: row.active,
    competencies: row.competencies.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      weight: c.weight,
      questions: c.questions.map((q) => ({
        id: q.id,
        question: q.question,
        guidance: q.guidance,
        difficulty: q.difficulty,
        active: q.active,
      })),
    })),
  };
}

/**
 * Resolve the ACTIVE blueprint for an application via its job's published
 * specification version. Tenant-safe by construction: the application's own
 * job chain is the only path.
 */
export async function getActiveBlueprintForApplication(applicationId: number) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      job: {
        select: {
          currentPublishedSpecificationVersionId: true,
        },
      },
    },
  });
  if (!application?.job.currentPublishedSpecificationVersionId) return null;

  return getBlueprintForSpec(application.job.currentPublishedSpecificationVersionId);
}

// ---------- admin writes ----------

function validateCompetencies(input: unknown): Array<{
  name: string;
  description: string | null;
  weight: number;
}> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BlueprintError("COMPETENCIES_REQUIRED", "At least one competency is required.");
  }
  if (input.length > MAX_COMPETENCIES) {
    throw new BlueprintError("TOO_MANY_COMPETENCIES");
  }

  const seen = new Set<string>();

  return input.map((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new BlueprintError("COMPETENCY_INVALID");
    }
    const c = raw as Record<string, unknown>;
    if (typeof c.name !== "string" || !c.name.trim()) {
      throw new BlueprintError("COMPETENCY_NAME_REQUIRED");
    }
    const name = c.name.trim();
    if (name.length > 120) {
      throw new BlueprintError("COMPETENCY_NAME_TOO_LONG");
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new BlueprintError("COMPETENCY_DUPLICATE", `Duplicate competency: ${name}`);
    }
    seen.add(key);

    const weight = Number(c.weight);
    if (!Number.isInteger(weight) || weight <= 0 || weight > 100) {
      throw new BlueprintError("COMPETENCY_WEIGHT_INVALID", `Weight for "${name}" must be 1-100.`);
    }
    const description =
      typeof c.description === "string" && c.description.trim()
        ? c.description.trim().slice(0, 500)
        : null;

    return { name, description, weight };
  });
}

export async function upsertBlueprintForSpec(input: {
  actorIsAdminVerified: true;
  specVersionId: unknown;
  competencies: unknown;
  questions: unknown;
}): Promise<SafeBlueprint> {
  await requireAdmin();
  return upsertBlueprintCore(input.specVersionId, input.competencies, input.questions);
}

/** Core blueprint write. Callers must enforce ADMIN auth. */
export async function upsertBlueprintCore(
  specVersionIdInput: unknown,
  competenciesInput: unknown,
  questionsInput: unknown,
): Promise<SafeBlueprint> {
  const specVersionId = validateSpecVersionId(specVersionIdInput);
  const spec = await prisma.jobSpecificationVersion.findFirst({
    where: {
      id: specVersionId,
      status: JobSpecificationVersionStatus.PUBLISHED,
    },
    select: { id: true },
  });
  if (!spec) {
    throw new BlueprintError("SPEC_NOT_PUBLISHED", "Blueprints attach to published specifications only.");
  }

  const competencies = validateCompetenciesWithTotal(competenciesInput);
  const questions = validateQuestions(questionsInput, competencies);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.interviewBlueprint.findUnique({
      where: { jobSpecificationVersionId: specVersionId },
    });

    let blueprint = existing;
    if (existing) {
      // Replace-all semantics inside one transaction; version increments so
      // historical EvaluationCompetencyScore snapshots remain interpretable.
      blueprint = await tx.interviewBlueprint.update({
        where: { id: existing.id },
        data: { version: existing.version + 1, active: true },
      });
      await tx.blueprintQuestion.deleteMany({ where: { blueprintId: existing.id } });
      await tx.blueprintCompetency.deleteMany({ where: { blueprintId: existing.id } });
    } else {
      blueprint = await tx.interviewBlueprint.create({
        data: { jobSpecificationVersionId: specVersionId },
      });
    }

    const created = await tx.blueprintCompetency.createManyAndReturn({
      data: competencies.map((c, index) => ({
        blueprintId: blueprint!.id,
        name: c.name,
        description: c.description,
        weight: c.weight,
        sortOrder: index,
      })),
    });
    const byName = new Map(created.map((c) => [c.name.toLowerCase(), c]));

    if (questions.length > 0) {
      await tx.blueprintQuestion.createMany({
        data: questions.map((q) => ({
          blueprintId: blueprint!.id,
          competencyId: byName.get(q.competencyName.toLowerCase())!.id,
          question: q.question,
          guidance: q.guidance,
          difficulty: q.difficulty,
        })),
      });
    }

    return blueprint!;
  });

  const full = await getBlueprintForSpec(result.jobSpecificationVersionId);
  if (!full) throw new BlueprintError("BLUEPRINT_LOAD_FAILED");
  return full;
}

// ---------- interviewer rubric submission ----------

export type CompetencyScoreInput = {
  competencyName: unknown;
  score: unknown;
  notes?: unknown;
};

export async function saveRubricScoresForInterviewer(
  applicationId: unknown,
  evaluationId: unknown,
  scoresInput: unknown,
): Promise<{ saved: number; complete: boolean }> {
  await assertInterviewerOwnsApplicationCompat(applicationId);
  return applyRubricScores(applicationId, evaluationId, scoresInput);
}

/**
 * Core rubric write. Enforces completeness against the active blueprint.
 * Caller must verify the interviewer owns the application/evaluation.
 */
export async function applyRubricScores(
  applicationIdInput: unknown,
  evaluationIdInput: unknown,
  scoresInput: unknown,
): Promise<{ saved: number; complete: boolean }> {
  const applicationId = applicationIdInput as number;

  if (
    typeof evaluationIdInput !== "number" ||
    !Number.isInteger(evaluationIdInput) ||
    evaluationIdInput <= 0
  ) {
    throw new BlueprintError("INVALID_EVALUATION_ID");
  }
  const evaluationId = evaluationIdInput;

  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, applicationId },
    select: { id: true },
  });
  if (!evaluation) {
    throw new BlueprintError("EVALUATION_NOT_FOUND");
  }

  const blueprint = await getActiveBlueprintForApplication(applicationId);
  if (!blueprint || !blueprint.active) {
    throw new BlueprintError("NO_ACTIVE_BLUEPRINT");
  }

  const byName = new Map(
    blueprint.competencies.map((c) => [c.name.toLowerCase(), c]),
  );

  if (!Array.isArray(scoresInput)) {
    throw new BlueprintError("SCORES_INVALID");
  }

  const prepared: Array<{
    competencyName: string;
    weightSnapshot: number;
    score: number;
    notes: string | null;
  }> = [];

  const provided = new Set<string>();
  for (const raw of scoresInput) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.competencyName !== "string") continue;

    const key = s.competencyName.trim().toLowerCase();
    const competency = byName.get(key);
    if (!competency) {
      throw new BlueprintError(
        "COMPETENCY_NOT_IN_BLUEPRINT",
        `"${s.competencyName}" is not part of this role's rubric.`,
      );
    }
    if (provided.has(key)) {
      throw new BlueprintError("SCORE_DUPLICATE", `Duplicate score for ${competency.name}.`);
    }
    provided.add(key);

    const score = Number(s.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new BlueprintError(
        "SCORE_INVALID",
        `Score for "${competency.name}" must be an integer 1-5.`,
      );
    }

    prepared.push({
      competencyName: competency.name, // canonical snapshot name
      weightSnapshot: competency.weight,
      score,
      notes:
        typeof s.notes === "string" && s.notes.trim()
          ? s.notes.trim().slice(0, 2000)
          : null,
    });
  }

  // Rubric gate: every competency must be scored in one atomic save.
  if (provided.size !== blueprint.competencies.length) {
    const missing = blueprint.competencies
      .filter((c) => !provided.has(c.name.toLowerCase()))
      .map((c) => c.name);
    throw new BlueprintError(
      "RUBRIC_INCOMPLETE",
      `Score all competencies before saving. Missing: ${missing.join(", ")}`,
    );
  }

  await prisma.$transaction([
    prisma.evaluationCompetencyScore.deleteMany({ where: { evaluationId: evaluation.id } }),
    prisma.evaluationCompetencyScore.createMany({
      data: prepared.map((row) => ({ ...row, evaluationId: evaluation.id })),
    }),
  ]);

  return { saved: prepared.length, complete: true };
}

export async function getRubricScoresForEvaluation(evaluationId: number) {
  return prisma.evaluationCompetencyScore.findMany({
    where: { evaluationId },
    orderBy: { competencyName: "asc" },
  });
}

// ---------- helpers ----------

function validateCompetenciesWithTotal(input: unknown) {
  const competencies = validateCompetencies(input);
  const total = competencies.reduce((sum, c) => sum + c.weight, 0);
  if (total !== 100) {
    throw new BlueprintError(
      "WEIGHTS_MUST_SUM_TO_100",
      `Competency weights must sum to 100 (got ${total}).`,
    );
  }
  return competencies;
}

function validateQuestions(input: unknown, competencies: Array<{ name: string }>) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new BlueprintError("QUESTIONS_INVALID");
  if (input.length > MAX_QUESTIONS) throw new BlueprintError("TOO_MANY_QUESTIONS");

  const names = new Set(competencies.map((c) => c.name.toLowerCase()));
  return input.map((raw) => {
    if (!raw || typeof raw !== "object") throw new BlueprintError("QUESTION_INVALID");
    const q = raw as Record<string, unknown>;
    if (typeof q.question !== "string" || !q.question.trim()) {
      throw new BlueprintError("QUESTION_TEXT_REQUIRED");
    }
    if (typeof q.competencyName !== "string") {
      throw new BlueprintError("QUESTION_COMPETENCY_REQUIRED");
    }
    const key = q.competencyName.trim().toLowerCase();
    if (!names.has(key)) {
      throw new BlueprintError(
        "QUESTION_COMPETENCY_UNKNOWN",
        `Question tagged to unknown competency "${q.competencyName}".`,
      );
    }
    return {
      competencyName: q.competencyName,
      question: q.question.trim().slice(0, 1000),
      guidance:
        typeof q.guidance === "string" && q.guidance.trim()
          ? q.guidance.trim().slice(0, 1000)
          : null,
      difficulty:
        typeof q.difficulty === "string" && ["EASY", "MEDIUM", "HARD"].includes(q.difficulty)
          ? q.difficulty
          : null,
    };
  });
}

function validateSpecVersionId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new BlueprintError("INVALID_SPEC_VERSION_ID");
}

async function assertInterviewerOwnsApplicationCompat(applicationId: unknown) {
  if (
    typeof applicationId !== "number" ||
    !Number.isInteger(applicationId) ||
    applicationId <= 0
  ) {
    throw new BlueprintError("INVALID_APPLICATION_ID");
  }
  const portal = await requireInterviewerPortal();
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      job: { assignedInterviewerId: portal.interviewerId },
    },
    select: { id: true, jobId: true },
  });
  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }
  return { interviewer: portal, application };
}
