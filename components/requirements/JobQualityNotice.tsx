import { validateJobQuality } from "@/lib/jobs/quality/job-quality";

export default function JobQualityNotice({
  title,
  description,
  location,
  remotePolicy,
  compensationRange,
  companyName,
}: {
  title: string;
  description: string | null;
  location: string | null;
  remotePolicy: string | null;
  compensationRange: string | null;
  companyName: string;
}) {
  const result = validateJobQuality({
    title,
    description: description ?? "",
    location,
    remotePolicy,
    compensationRange,
    companyName,
    channel: "CAREERS",
  });

  if (result.errors.length === 0 && result.warnings.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Publication checks</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Errors block a clean public posting. Warnings are recommendations.
        Nothing here is rewritten for you.
      </p>
      {result.errors.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {result.errors.map((issue) => (
            <li
              key={issue.code}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {result.warnings.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {result.warnings.map((issue) => (
            <li
              key={issue.code}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
