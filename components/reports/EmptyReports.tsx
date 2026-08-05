export default function EmptyReports() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
      <div className="text-5xl">📊</div>

      <h2 className="mt-6 text-2xl font-bold text-black">
        No reports found
      </h2>

      <p className="mt-3 text-center text-zinc-600">
        Try another search or complete more interviews.
      </p>
    </div>
  );
}