import { z } from "zod";

export const rubricCriterionSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, "Use lowercase letters, numbers, and dashes."),
    label: z.string().trim().min(2).max(120),
    description: z.string().trim().max(600).default(""),
    maxPoints: z.number().int().min(1).max(20),
  })
  .strict();

export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export const rubricSchema = z
  .array(rubricCriterionSchema)
  .max(10)
  .superRefine((rows, ctx) => {
    const keys = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (keys.has(row.key)) {
        ctx.addIssue({ code: "custom", message: `Criterion key "${row.key}" is repeated.`, path: [index, "key"] });
      }
      keys.add(row.key);
    }
  });

const percent = z.number().int().min(0).max(100);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

export const screeningPolicyInputSchema = z
  .object({
    basicWeight: percent,
    practicalWeight: percent,
    evidenceWeight: percent,
    basicPassPercent: percent.nullable(),
    practicalPassPercent: percent.nullable(),
    borderlineBandPercent: z.number().int().min(0).max(25),
    reviewCapacity: z.number().int().min(1).max(1000),
    practicalTitle: optionalText(160),
    practicalInstructions: optionalText(8000),
    practicalEstimatedMinutes: z.number().int().min(10).max(480).nullable(),
    practicalAllowedResources: optionalText(2000),
    practicalDeadlineDays: z.number().int().min(1).max(30),
    practicalCompensationNote: optionalText(1000),
    practicalRubric: rubricSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.basicWeight + value.practicalWeight + value.evidenceWeight !== 100) {
      ctx.addIssue({ code: "custom", message: "Weights must add up to 100.", path: ["basicWeight"] });
    }
    if (value.practicalWeight > 0 && value.practicalRubric.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "A practical weight needs at least one rubric criterion.",
        path: ["practicalRubric"],
      });
    }
  });

export type ScreeningPolicyInput = z.infer<typeof screeningPolicyInputSchema>;

export type ScreeningPolicy = ScreeningPolicyInput & {
  /** Null when no version has been saved and the defaults below apply. */
  id: number | null;
  version: number | null;
};

/**
 * Illustrative starting point, not a validated hiring rule. Recruiters see
 * these as unsaved defaults until they save a version for the job.
 */
export const DEFAULT_SCREENING_POLICY: ScreeningPolicy = {
  id: null,
  version: null,
  basicWeight: 30,
  practicalWeight: 50,
  evidenceWeight: 20,
  basicPassPercent: null,
  practicalPassPercent: null,
  borderlineBandPercent: 5,
  reviewCapacity: 20,
  practicalTitle: null,
  practicalInstructions: null,
  practicalEstimatedMinutes: 90,
  practicalAllowedResources: null,
  practicalDeadlineDays: 5,
  practicalCompensationNote: null,
  practicalRubric: [
    { key: "correctness", label: "Functional correctness", description: "The work does what the task asks.", maxPoints: 5 },
    { key: "quality", label: "Quality", description: "Readable, maintainable, appropriate for the role.", maxPoints: 5 },
    { key: "testing", label: "Testing and edge cases", description: "Checks the work and handles edge cases.", maxPoints: 5 },
    { key: "reasoning", label: "Reasoning", description: "Explains decisions, trade-offs, and limitations.", maxPoints: 5 },
  ],
};

export function parseScreeningPolicyInput(value: unknown) {
  return screeningPolicyInputSchema.safeParse(value);
}

export function parseRubric(value: unknown): RubricCriterion[] {
  const parsed = rubricSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function rubricMaxPoints(rubric: RubricCriterion[]) {
  return rubric.reduce((sum, row) => sum + row.maxPoints, 0);
}

type PolicyRow = Omit<ScreeningPolicyInput, "practicalRubric"> & {
  id: number;
  version: number;
  practicalRubric: unknown;
};

export function policyFromRow(row: PolicyRow | null): ScreeningPolicy {
  if (!row) return DEFAULT_SCREENING_POLICY;
  return {
    id: row.id,
    version: row.version,
    basicWeight: row.basicWeight,
    practicalWeight: row.practicalWeight,
    evidenceWeight: row.evidenceWeight,
    basicPassPercent: row.basicPassPercent,
    practicalPassPercent: row.practicalPassPercent,
    borderlineBandPercent: row.borderlineBandPercent,
    reviewCapacity: row.reviewCapacity,
    practicalTitle: row.practicalTitle,
    practicalInstructions: row.practicalInstructions,
    practicalEstimatedMinutes: row.practicalEstimatedMinutes,
    practicalAllowedResources: row.practicalAllowedResources,
    practicalDeadlineDays: row.practicalDeadlineDays,
    practicalCompensationNote: row.practicalCompensationNote,
    practicalRubric: parseRubric(row.practicalRubric),
  };
}
