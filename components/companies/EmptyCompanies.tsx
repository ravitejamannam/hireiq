export default function EmptyCompanies() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
      <div className="text-5xl">🏢</div>

      <h2 className="mt-6 text-2xl font-bold text-black">
        No companies found
      </h2>

      <p className="mt-3 text-center text-zinc-600">
        Try a different search or create a new company.
      </p>
    </div>
  );
}