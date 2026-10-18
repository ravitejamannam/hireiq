export type KnockoutQuestionDraft = {
  id: number;
  expectedAnswer: string;
};

export function gradeKnockouts(input: {
  questions: KnockoutQuestionDraft[];
  answers: Array<{ questionId: number; answer: string }>;
}) {
  const results = input.questions.map((question) => {
    const answer = input.answers.find((row) => row.questionId === question.id)?.answer ?? "";
    const passed = answer.trim().toLowerCase() === question.expectedAnswer.trim().toLowerCase();
    return { questionId: question.id, passed };
  });
  return {
    results,
    rejectByRule: results.some((row) => !row.passed),
  };
}

export function parseScreeningAnswers(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const raw = (body as { screeningAnswers?: unknown }).screeningAnswers;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const question = (row as { question?: unknown }).question;
    const answer = (row as { answer?: unknown }).answer;
    if (typeof question !== "string" || !question.trim()) return [];
    if (typeof answer !== "string") return [];
    return [{ question: question.trim().slice(0, 500), answer: answer.trim().slice(0, 2000) }];
  });
}

export function parseKnockoutAnswers(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const raw = (body as { knockoutAnswers?: unknown }).knockoutAnswers;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const questionId = (row as { questionId?: unknown }).questionId;
    const answer = (row as { answer?: unknown }).answer;
    if (typeof questionId !== "number" || !Number.isInteger(questionId)) return [];
    if (typeof answer !== "string") return [];
    return [{ questionId, answer }];
  });
}
