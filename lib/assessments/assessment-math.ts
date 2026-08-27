export const ASSESSMENT_QUESTIONS_PER_INVITE = 10;
const RANDOMISATION_POOL_FACTOR = 2;

export const ADAPTIVE_MIX: Array<{
  difficulty: "EASY" | "MEDIUM" | "HARD";
  share: number;
}> = [
  { difficulty: "EASY", share: 0.4 },
  { difficulty: "MEDIUM", share: 0.4 },
  { difficulty: "HARD", share: 0.2 },
];

export type AdaptiveQuestion = {
  id: number;
  prompt?: string;
  choices?: unknown;
  correctIndex: number;
  weight: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

export type ScoringKey = Record<string, { correctIndex: number; weight: number }>;

export type ScoredAssessmentAnswer = {
  questionId: number;
  selectedIndex: number;
  isCorrect: boolean;
  weight: number;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function scoreAssessmentAnswers(input: {
  questionIds: number[];
  selected: Record<number, number>;
  scoringKey: ScoringKey;
}): { score: number; rows: ScoredAssessmentAnswer[] } {
  let score = 0;
  const rows: ScoredAssessmentAnswer[] = [];
  for (const questionId of input.questionIds) {
    const key = input.scoringKey[String(questionId)];
    const selectedIndex = input.selected[questionId];
    const weight = key?.weight ?? 0;
    const isCorrect =
      typeof selectedIndex === "number" &&
      Boolean(key) &&
      selectedIndex === key.correctIndex;
    if (isCorrect) {
      score += weight;
    }
    rows.push({
      questionId,
      selectedIndex: selectedIndex ?? -1,
      isCorrect,
      weight,
    });
  }
  return { score, rows };
}

export function selectAdaptiveMix<T extends AdaptiveQuestion>(questions: T[]): T[] {
  if (questions.length <= ASSESSMENT_QUESTIONS_PER_INVITE) {
    return shuffle(questions);
  }

  const byTier = new Map<string, T[]>();
  for (const q of questions) {
    const list = byTier.get(q.difficulty) ?? [];
    list.push(q);
    byTier.set(q.difficulty, list);
  }

  const targets = ADAPTIVE_MIX.map(({ difficulty, share }) => ({
    difficulty,
    count: Math.min(
      Math.floor(ASSESSMENT_QUESTIONS_PER_INVITE * share),
      byTier.get(difficulty)?.length ?? 0,
    ),
  }));

  let remaining =
    ASSESSMENT_QUESTIONS_PER_INVITE - targets.reduce((s, t) => s + t.count, 0);
  while (remaining > 0) {
    const donor = targets
      .map((t) => ({
        ...t,
        available: byTier.get(t.difficulty)?.length ?? 0,
      }))
      .filter((t) => t.available > t.count)
      .sort((a, b) => b.available - b.count - (a.available - a.count))[0];
    if (!donor) break;
    donor.count += 1;
    remaining -= 1;
  }

  const picked: T[] = [];
  for (const { difficulty, count } of targets) {
    const pool = byTier.get(difficulty) ?? [];
    const poolSize = Math.min(
      pool.length,
      Math.max(count * RANDOMISATION_POOL_FACTOR, count),
    );
    picked.push(...shuffle(pool.slice(0, poolSize)).slice(0, count));
  }

  if (picked.length < ASSESSMENT_QUESTIONS_PER_INVITE) {
    const chosenIds = new Set(picked.map((q) => q.id));
    const leftovers = shuffle(questions.filter((q) => !chosenIds.has(q.id)));
    picked.push(
      ...leftovers.slice(0, ASSESSMENT_QUESTIONS_PER_INVITE - picked.length),
    );
  }

  return picked;
}
