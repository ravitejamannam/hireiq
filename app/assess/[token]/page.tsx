import { notFound } from "next/navigation";

import { CodeAnswer } from "@/components/assessments/CodeAnswer";
import { difficultyForSortOrder } from "@/lib/assessments/submission-similarity";
import { loadCandidateAssessment } from "@/lib/assessments/generated-assessment-service";

type PageProps = { params: Promise<{ token: string }> };

export default async function CandidateAssessmentPage({ params }: PageProps) {
  const { token } = await params;
  const page = await loadCandidateAssessment(token);
  if (!page) notFound();
  if (page.closed) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-2xl font-bold">Assessment closed</h1>
        <p className="mt-2 text-sm text-zinc-600">This link expired or the assessment was already submitted. Your score is not shown here.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">{page.title}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        {page.timeLimitMinutes} minutes. One attempt. Answers save as you go. AI may grade written answers; you will not see that score.
      </p>
      <form className="mt-2" method="post" action={`/assess/${token}/extra-time`}>
        <button type="submit" className="min-h-6 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900">
          {page.extraTimeRequested ? "Extra time requested" : "Request extra time"}
        </button>
      </form>
      <ol className="mt-6 space-y-4">
        {page.items.map((item, index) => (
          <li key={item.id} className="rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold">{index + 1}. {item.prompt}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{difficultyForSortOrder(index + 1)}</p>
            {item.choices.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {item.choices.map((choice) => <li key={choice}>{choice}</li>)}
              </ul>
            ) : (
              <CodeAnswer label={item.prompt} />
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
