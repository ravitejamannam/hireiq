import type { AssessmentLeaderboardPage } from "@/lib/assessments/assessment-service";
import { formatClientDateTime } from "@/components/client/client-labels";

export default function AssessmentLeaderboard({
  board,
}: {
  board: AssessmentLeaderboardPage;
}) {
  if (board.rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-zinc-600">
        No completed assessments yet.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {board.totalCompleted > board.rows.length ? (
        <p className="mb-3 text-xs text-zinc-500">
          Showing the top {board.rows.length} of {board.totalCompleted}{" "}
          completed assessments.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm text-zinc-600">
          <thead className="bg-zinc-50 text-black">
            <tr>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr
                key={row.rank}
                className="border-t border-zinc-200"
              >
                <td className="px-4 py-3">{row.rank}</td>
                <td className="px-4 py-3">{row.displayName}</td>
                <td className="px-4 py-3">
                  {row.score} / {row.maxScore}
                </td>
                <td className="px-4 py-3">
                  {formatClientDateTime(new Date(row.submittedAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
