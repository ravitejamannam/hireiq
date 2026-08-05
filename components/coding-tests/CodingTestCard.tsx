type CodingTestCardProps = {
  title: string;
  candidate: string;
  company: string;
  difficulty: string;
  status: string;
};

export default function CodingTestCard({
  title,
  candidate,
  company,
  difficulty,
  status,
}: CodingTestCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">
            {title}
          </h3>

          <p className="mt-1 text-zinc-500">
            {candidate}
          </p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {status}
        </div>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-4 space-y-2">
        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">
            Company:
          </span>{" "}
          {company}
        </p>

        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-black">
            Difficulty:
          </span>{" "}
          {difficulty}
        </p>
      </div>
    </article>
  );
}