import Link from "next/link";

export default function CandidateLeaderboardNotice({ backHref }: { backHref: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-start px-6 py-16">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-10">
        <h1 className="text-3xl font-bold text-black">No public ranking</h1>
        <p className="mt-3 text-zinc-600">
          Candidates do not see other applicants&apos; results. The hiring team reviews every submission individually.
        </p>
        <Link href={backHref} className="mt-6 inline-block text-sm font-medium text-black underline">
          Back
        </Link>
      </div>
    </main>
  );
}
