import type { JobDescriptionAiGenerationStatus } from "@prisma/client";

import { diffWords } from "@/lib/ai/job-description-document";

export function JobDescriptionAiView({
  status,
  error,
  currentJobDescription,
  proposedText,
  onGenerate,
  onAccept,
  onDiscard,
}: {
  status: JobDescriptionAiGenerationStatus | null;
  error: string | null;
  currentJobDescription: string | null;
  proposedText: string | null;
  onGenerate: () => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const diff =
    status === "READY" && proposedText
      ? diffWords(currentJobDescription ?? "", proposedText)
      : null;
  return (
    <section>
      <button type="button" onClick={onGenerate} disabled={status === "GENERATING"}>
        Generate with AI
      </button>
      {status === "GENERATING" ? <p role="status">Generating…</p> : null}
      {status === "FAILED" ? (
        <div>
          <p>{error ?? "We couldn't generate the job description right now. Your requirement was not changed."}</p>
          <button type="button" onClick={onGenerate}>
            Retry
          </button>
        </div>
      ) : null}
      {status === "READY" && proposedText ? (
        <div>
          <p>{currentJobDescription}</p>
          <p>{proposedText}</p>
          {diff ? <p>{diff.added.join(" ")}</p> : null}
          <button type="button" onClick={onAccept}>
            Accept
          </button>
          <button type="button" onClick={onDiscard}>
            Discard
          </button>
        </div>
      ) : null}
    </section>
  );
}
