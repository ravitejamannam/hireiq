import { z } from "zod";

import { rubricItemsFromPayload } from "@/lib/ai/job-description-document";

export const assessmentItemSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    type: z.enum(["multiple_choice", "short_answer", "scenario", "coding"]),
    prompt: z.string().trim().min(12).max(2000),
    choices: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
    correctIndex: z.number().int().min(0).max(5).optional(),
    requirement: z.string().trim().min(1).max(300),
    rubricCriterion: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.type === "multiple_choice") {
      if (!item.choices || item.choices.length < 2) {
        ctx.addIssue({ code: "custom", message: "Multiple choice needs choices.", path: ["choices"] });
      }
      if (item.correctIndex === undefined || (item.choices && item.correctIndex >= item.choices.length)) {
        ctx.addIssue({ code: "custom", message: "Multiple choice needs a correct choice.", path: ["correctIndex"] });
      }
    }
  });

export const assessmentDraftSchema = z.array(assessmentItemSchema).min(6).max(12);

export type AssessmentItem = z.infer<typeof assessmentItemSchema>;

export function parseAssessmentItems(value: unknown) {
  return assessmentDraftSchema.safeParse(value);
}

export function generateAssessmentFromRubric(input: {
  requirements: string[];
  rubric: Array<{ criterion: string; signal: string }>;
}) {
  const rubric = input.rubric.length > 0 ? input.rubric : [{ criterion: "Overall judgment", signal: "Evidence in the answer" }];
  const requirements = input.requirements.filter((line) => line.trim()).slice(0, 8);
  const seeds = requirements.length > 0 ? requirements : rubric.map((item) => item.criterion);
  const types = ["multiple_choice", "short_answer", "scenario", "coding"] as const;
  const items: AssessmentItem[] = [];
  const poolSize = 12;
  for (let index = 0; index < poolSize; index += 1) {
    const source = seeds[index % seeds.length] ?? "the role";
    const criterion = rubric[index % rubric.length]?.criterion ?? "Overall judgment";
    const type = types[index % types.length];
    items.push({
      id: `item-${index + 1}`,
      type,
      prompt:
        type === "multiple_choice"
          ? `Which option best shows ${criterion} for ${source}?`
          : type === "coding"
            ? `In text, outline how you would implement ${source}. Name the checks you would run.`
            : type === "scenario"
              ? `A teammate disagrees about ${source}. Write how you would decide, citing ${criterion}.`
              : `In a few sentences, show ${criterion} on ${source}.`,
      choices: type === "multiple_choice" ? ["A concrete example from production", "A guess with no example", "Skip the requirement", "Change the role"] : undefined,
      correctIndex: type === "multiple_choice" ? 0 : undefined,
      requirement: source.slice(0, 300),
      rubricCriterion: criterion,
    });
  }
  return assessmentDraftSchema.parse(items);
}

export function drawAssessmentItems(items: AssessmentItem[], seed: number) {
  const order = shuffleIds(items.map((item) => item.id), seed);
  const picked = order.slice(0, Math.min(8, items.length));
  const byId = new Map(items.map((item) => [item.id, item]));
  return picked.map((id) => byId.get(id)).filter((item): item is AssessmentItem => Boolean(item));
}

export function rubricFromSpec(payload: unknown, mustHave: string | null, niceToHave: string | null) {
  const rubric = rubricItemsFromPayload(payload);
  const requirements = [mustHave, niceToHave]
    .flatMap((text) => (text ? text.split(/\n+/) : []))
    .map((line) => line.trim())
    .filter(Boolean);
  return { rubric, requirements };
}

export function canPublish(status: "DRAFT" | "PUBLISHED") {
  return status === "DRAFT";
}

export function candidateMaySeeScore() {
  return false;
}

export function gradeMultipleChoice(item: AssessmentItem, selectedIndex: number) {
  if (item.type !== "multiple_choice" || item.correctIndex === undefined) return null;
  return { correct: selectedIndex === item.correctIndex, score: selectedIndex === item.correctIndex ? 1 : 0 };
}

export function acceptQuotedGrade(input: {
  answer: string;
  quote: string | null;
  score: number | null;
  confidence: "low" | "high";
  optedOut: boolean;
  humanReview: boolean;
}) {
  if (input.optedOut || input.humanReview) {
    return { needsHuman: true as const, score: null, quote: null, reason: "human-only" };
  }
  if (input.confidence === "low" || !input.quote || !input.answer.includes(input.quote)) {
    return { needsHuman: true as const, score: null, quote: null, reason: "invalid-quote" };
  }
  return { needsHuman: false as const, score: input.score, quote: input.quote, reason: "quoted" };
}

export function tokenUsable(input: { submittedAt: Date | null; expiresAt: Date; now: Date }) {
  if (input.submittedAt) return false;
  return input.expiresAt.getTime() > input.now.getTime();
}

export function autosaveAnswers(current: Record<string, string>, patch: Record<string, string>) {
  return { ...current, ...patch };
}

export function remainingMs(input: { startedAt: Date; now: Date; limitMinutes: number; extraTime: boolean }) {
  const limit = input.limitMinutes * 60_000 * (input.extraTime ? 1.5 : 1);
  return Math.max(0, input.startedAt.getTime() + limit - input.now.getTime());
}

export function shuffleIds(ids: string[], seed: number) {
  const copy = [...ids];
  let state = seed || 1;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 16807) % 2147483647;
    const swap = state % (index + 1);
    const current = copy[index];
    copy[index] = copy[swap]!;
    copy[swap] = current!;
  }
  return copy;
}
