import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";

import AssessmentLeaderboard from "@/components/assess/AssessmentLeaderboard";
import { AssessmentError } from "@/lib/assessments/assessment-errors";
import { getAssessmentLeaderboardForApplyToken } from "@/lib/assessments/assessment-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Leaderboard",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ApplyLeaderboardPage({ params }: PageProps) {
  noStore();
  const { token } = await params;

  let board = null;
  let loadError: string | null = null;
  try {
    board = await getAssessmentLeaderboardForApplyToken(token);
  } catch (error) {
    if (error instanceof AssessmentError) {
      loadError = error.message;
    } else {
      throw error;
    }
  }

  if (loadError || !board) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-start px-6 py-16">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-10">
          <h1 className="text-3xl font-bold text-black">Leaderboard unavailable</h1>
          <p className="mt-3 text-zinc-600">{loadError ?? "Not found."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <article className="rounded-2xl border border-zinc-200 bg-white p-10">
        <p className="text-sm text-zinc-500">{board.companyDisplayName}</p>
        <h1 className="mt-2 text-3xl font-bold text-black">{board.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Public ranking of completed assessments for this role. Names are first
          name and last initial. This board is the assessment only — not a hire
          score.
        </p>
        <AssessmentLeaderboard board={board} />
        <Link
          href={`/apply/${encodeURIComponent(token)}`}
          className="mt-8 inline-block text-sm font-semibold text-black underline underline-offset-2"
        >
          Back to apply
        </Link>
      </article>
    </main>
  );
}
