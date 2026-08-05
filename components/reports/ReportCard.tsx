type ReportCardProps = {
  candidate: string;
  company: string;
  score: number;
  result: string;
};

export default function ReportCard({
  candidate,
  company,
  score,
  result,
}: ReportCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">
            {candidate}
          </h3>

          <p className="mt-1 text-zinc-500">
            {company}
          </p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {result}
        </div>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4">
        <p className="text-sm text-zinc-500">
          AI Score
        </p>

        <p className="mt-2 text-3xl font-bold text-black">
          {score}%
        </p>
      </div>
    </article>
  );
}