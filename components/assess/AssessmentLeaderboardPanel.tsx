import AssessmentLeaderboard from "@/components/assess/AssessmentLeaderboard";
import type { AssessmentLeaderboardPage } from "@/lib/assessments/assessment-service";

export default function AssessmentLeaderboardPanel({
  board,
}: {
  board: AssessmentLeaderboardPage;
}) {
  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Assessment leaderboard</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Hiring-team view: full names, ranked by completed role assessments.
        The public apply board shows first name and last initial only.
        Assessment score is not a hire score, matching score, or ranking score.
      </p>
      <AssessmentLeaderboard board={board} />
    </section>
  );
}
