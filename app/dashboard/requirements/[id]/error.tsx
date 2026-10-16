"use client";

export default function RequirementDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-bold text-black">This requirement could not be loaded</h1>
      <p className="mt-3 text-zinc-600">
        The page failed while loading. This is not a missing requirement.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </main>
  );
}
