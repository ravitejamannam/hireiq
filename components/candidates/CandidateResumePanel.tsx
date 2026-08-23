import ResumeUploadForm from "@/components/candidates/ResumeUploadForm";
import { requireAdmin } from "@/lib/auth/authorization";
import { listResumeDocumentsForCandidate } from "@/lib/resumes/resume-service";

const PARSE_STYLES: Record<string, string> = {
  PARSED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  PENDING: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};

type ResumePanelProps = {
  candidateId: number;
};

export default async function CandidateResumePanel({
  candidateId,
}: ResumePanelProps) {
  await requireAdmin();
  const documents = await listResumeDocumentsForCandidate(candidateId);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="font-semibold text-zinc-900">Resume</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Uploaded resumes are stored as binary objects, hashed, and their
        extracted text becomes candidate evidence.
      </p>

      {documents.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-100 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {doc.fileName}
                </p>
                <p className="text-xs text-zinc-500">
                  {(doc.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                  {new Date(doc.createdAt).toLocaleString()}
                  {doc.parseErrorCode ? ` · ${doc.parseErrorCode}` : ""}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                  PARSE_STYLES[doc.parseStatus] ?? "bg-zinc-50 text-zinc-600 ring-zinc-500/20"
                }`}
              >
                {doc.parseStatus}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">No resumes uploaded yet.</p>
      )}

      <div className="mt-5 border-t border-zinc-100 pt-5">
        <ResumeUploadForm candidateId={candidateId} />
      </div>
    </section>
  );
}
