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
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    language: z.enum(["javascript", "python"]).optional(),
    starter: z.string().max(4000).optional(),
    tests: z.array(z.object({
      input: z.string().max(2000),
      output: z.string().max(2000),
      hidden: z.boolean().optional(),
    })).max(12).optional(),
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

export const assessmentDraftSchema = z.array(assessmentItemSchema).min(6).max(20);

/**
 * Pool-size target. A set is a candidate's questions as an unordered id list; a repeat is an
 * invite whose set equals an earlier invite's set for the same assessment version.
 * The generated pool aims for at least `capacityPerInvite` distinct balanced sets per expected
 * invitation, so repeats stay at `maxRepeatRate` until a version passes that many invitations.
 * 16 questions (5 easy, 7 medium, 4 hard) drawn 8 at a time give 2,099 balanced sets;
 * the earlier 12-question pool gave 90.
 */
export const QUESTION_POOL_TARGET = {
  poolSize: 16,
  drawCount: 8,
  expectedInvitesPerVersion: 1000,
  capacityPerInvite: 1.5,
  maxRepeatRate: 0,
} as const;

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
  // 5 easy, 7 medium, 4 hard across the 16-question pool, spread over every question type.
  const difficulties = ["easy", "medium", "hard", "medium", "medium", "easy", "medium", "hard", "hard", "medium", "easy", "easy", "medium", "easy", "hard", "medium"] as const;
  const items: AssessmentItem[] = [];
  const poolSize = QUESTION_POOL_TARGET.poolSize;
  for (let index = 0; index < poolSize; index += 1) {
    const source = seeds[index % seeds.length] ?? "the role";
    const criterion = rubric[index % rubric.length]?.criterion ?? "Overall judgment";
    const type = types[index % types.length];
    // Type and source repeat every 12 items, so later items use second wordings.
    const second = index >= 12;
    items.push({
      id: `item-${index + 1}`,
      type,
      difficulty: difficulties[index],
      prompt:
        type === "multiple_choice"
          ? second
            ? `Which answer gives the strongest evidence of ${criterion} in ${source}?`
            : `Which option best shows ${criterion} for ${source}?`
          : type === "coding"
            ? second
              ? `In text, describe the steps and edge cases for ${source}, and how you would test each one.`
              : `In text, outline how you would implement ${source}. Name the checks you would run.`
            : type === "scenario"
              ? second
                ? `A deadline forces a trade-off on ${source}. Say what you would cut or keep and why, citing ${criterion}.`
                : `A teammate disagrees about ${source}. Choose an approach and explain your answer, citing ${criterion}.`
              : second
                ? `Describe a time you used ${source}. What showed ${criterion}?`
                : `In a few sentences, show ${criterion} on ${source}.`,
      choices: type === "multiple_choice" ? ["A concrete example from production", "A guess with no example", "Skip the requirement", "Change the role"] : undefined,
      correctIndex: type === "multiple_choice" ? 0 : undefined,
      requirement: source.slice(0, 300),
      rubricCriterion: criterion,
    });
  }
  return assessmentDraftSchema.parse(items);
}

export type Difficulty = "easy" | "medium" | "hard";
/** Target share of each difficulty in a candidate's set. */
export const DIFFICULTY_MIX: Record<Difficulty, number> = { easy: 0.3, medium: 0.5, hard: 0.2 };
const WRITTEN_TYPES = new Set<AssessmentItem["type"]>(["short_answer", "scenario"]);

export function difficultyOf(item: AssessmentItem): Difficulty {
  return item.difficulty ?? "medium";
}

/** How many of each difficulty a set of `count` questions should hold. Rounds toward medium. */
export function difficultyTargets(count: number): Record<Difficulty, number> {
  const easy = Math.round(count * DIFFICULTY_MIX.easy);
  const hard = Math.round(count * DIFFICULTY_MIX.hard);
  return { easy, hard, medium: Math.max(0, count - easy - hard) };
}

/**
 * Seeded draw that follows the difficulty mix where the pool allows, fills any
 * shortfall from the remaining questions, and always includes at least one
 * written "explain your answer" question when the pool has one.
 */
export function drawAssessmentItems(items: AssessmentItem[], seed: number, count = 8) {
  const size = Math.max(1, Math.min(count, items.length));
  const shuffled = shuffleIds(items.map((item) => item.id), seed);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = shuffled.map((id) => byId.get(id)!).filter(Boolean);
  const targets = difficultyTargets(size);
  const picked: AssessmentItem[] = [];
  const take = (item: AssessmentItem) => {
    if (picked.length < size && !picked.includes(item)) picked.push(item);
  };
  const written = ordered.find((item) => WRITTEN_TYPES.has(item.type));
  if (written) {
    take(written);
    targets[difficultyOf(written)] = Math.max(0, targets[difficultyOf(written)] - 1);
  }
  for (const level of ["easy", "medium", "hard"] as const) {
    for (const item of ordered.filter((row) => difficultyOf(row) === level && !picked.includes(row)).slice(0, targets[level])) take(item);
  }
  for (const item of ordered) take(item);
  const order = new Map(shuffled.map((id, index) => [id, index]));
  return picked.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

export function questionSetKey(ids: string[]) {
  return [...ids].sort().join(",");
}

function choose(n: number, k: number) {
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
    if (result > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return Math.round(result);
}

/**
 * How many different sets drawAssessmentItems can return: the difficulty mix is exact and
 * every set holds a written question. Falls back to n-choose-k when a level is short.
 */
export function questionSetCapacity(items: AssessmentItem[], count: number) {
  const size = Math.max(1, Math.min(count, items.length));
  const targets = difficultyTargets(size);
  const levels = ["easy", "medium", "hard"] as const;
  const all = levels.map((level) => items.filter((item) => difficultyOf(item) === level).length);
  if (levels.some((level, index) => all[index]! < targets[level])) return choose(items.length, size);
  const unwritten = levels.map((level) => items.filter((item) => difficultyOf(item) === level && !WRITTEN_TYPES.has(item.type)).length);
  const product = (counts: number[]) => levels.reduce((total, level, index) => total * choose(counts[index]!, targets[level]), 1);
  const hasWritten = items.some((item) => WRITTEN_TYPES.has(item.type));
  return hasWritten ? product(all) - product(unwritten) : product(all);
}

/**
 * Tries successive seeds until the drawn set differs from every set already issued for this
 * assessment. Once every possible set is used, returns the least-used set among the tries so
 * repeats spread evenly, and says it is not unique.
 */
export function drawUnusedAssessmentItems(input: {
  items: AssessmentItem[];
  seed: number;
  count: number;
  setUses: Map<string, number>;
  maxAttempts?: number;
}) {
  const capacity = questionSetCapacity(input.items, input.count);
  const attempts = input.maxAttempts ?? 50;
  let best: { items: AssessmentItem[]; uses: number } | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const drawn = drawAssessmentItems(input.items, input.seed + attempt * 7919, input.count);
    const uses = input.setUses.get(questionSetKey(drawn.map((item) => item.id))) ?? 0;
    if (uses === 0) return { items: drawn, unique: true, capacity };
    if (!best || uses < best.uses) best = { items: drawn, uses };
  }
  return { items: best!.items, unique: false, capacity };
}

const MAX_INTEGRITY_COUNT = 10_000;
const MAX_ITEM_SECONDS = 24 * 60 * 60;

/**
 * Integrity signals are context for a reviewer, never a penalty. Only known
 * counters and per-question seconds for questions this candidate was given are kept.
 */
export function sanitizeIntegrity(value: unknown, order: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const count = (input: unknown) =>
    typeof input === "number" && Number.isFinite(input) ? Math.min(MAX_INTEGRITY_COUNT, Math.max(0, Math.floor(input))) : 0;
  const allowed = new Set(order);
  const itemSeconds: Record<string, number> = {};
  if (raw.itemSeconds && typeof raw.itemSeconds === "object" && !Array.isArray(raw.itemSeconds)) {
    for (const [id, seconds] of Object.entries(raw.itemSeconds as Record<string, unknown>)) {
      if (allowed.has(id) && typeof seconds === "number" && Number.isFinite(seconds)) {
        itemSeconds[id] = Math.min(MAX_ITEM_SECONDS, Math.max(0, Math.floor(seconds)));
      }
    }
  }
  return { tabSwitches: count(raw.tabSwitches), pastes: count(raw.pastes), itemSeconds };
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

export const ANSWER_MAX_LENGTH = 20_000;
/** Network slack after the timer so a save sent at 0:00 still lands. */
export const SUBMIT_GRACE_MS = 60_000;

/**
 * Accept only answers for items this candidate was given. Multiple choice
 * must be an in-range index. Anything else is refused, not dropped silently.
 */
export function validateAnswerPatch(input: {
  patch: unknown;
  order: string[];
  items: Map<string, AssessmentItem>;
}): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  if (!input.patch || typeof input.patch !== "object" || Array.isArray(input.patch)) {
    return { ok: false, error: "Answers must be an object." };
  }
  const allowed = new Set(input.order);
  const answers: Record<string, string> = {};
  for (const [itemId, value] of Object.entries(input.patch as Record<string, unknown>)) {
    const item = input.items.get(itemId);
    if (!allowed.has(itemId) || !item) return { ok: false, error: "An answer refers to a question you were not given." };
    if (typeof value !== "string" || value.length > ANSWER_MAX_LENGTH) return { ok: false, error: "An answer is not valid text or is too long." };
    if (item.type === "multiple_choice" && value !== "") {
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index >= (item.choices?.length ?? 0)) {
        return { ok: false, error: "A multiple-choice answer is out of range." };
      }
    }
    answers[itemId] = value;
  }
  return { ok: true, answers };
}

/** When answers stop being accepted: the timer (with any accommodation) or the link expiry, whichever is first. */
export function attemptDeadline(input: { startedAt: Date | null; expiresAt: Date; limitMinutes: number; extraTime: boolean }) {
  if (!input.startedAt) return input.expiresAt;
  const timer = input.startedAt.getTime() + input.limitMinutes * 60_000 * (input.extraTime ? 1.5 : 1);
  return new Date(Math.min(timer, input.expiresAt.getTime()));
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
