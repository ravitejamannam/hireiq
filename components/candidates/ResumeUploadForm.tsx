"use client";

import { useRef, useState, useTransition } from "react";

import { uploadCandidateResume } from "@/app/actions/resume-actions";

type ResumeUploadFormProps = {
  candidateId: number;
  applicationId?: number | null;
};

export default function ResumeUploadForm({
  candidateId,
  applicationId,
}: ResumeUploadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function pollRecruiterParse(documentId: number, fileName: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(`/api/resumes/${documentId}/status`);
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; parseStatus?: string; fieldsNeedReview?: boolean }
        | null;
      if (!response.ok || !body?.ok || body.parseStatus === "PARSING") continue;
      setMessage({
        ok: body.parseStatus !== "FAILED",
        text:
          body.parseStatus === "FAILED"
            ? `${fileName} could not be read.`
            : body.fieldsNeedReview
              ? `${fileName} was read. Some fields need review.`
              : `${fileName} is ready.`,
      });
      return;
    }
  }

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await uploadCandidateResume(candidateId, applicationId ?? null, formData);
      if (result.ok) {
        formRef.current?.reset();
        if (result.document.parseStatus === "PARSING") {
          setMessage({ ok: true, text: `Reading ${result.document.fileName}… You can keep working.` });
          void pollRecruiterParse(result.document.id, result.document.fileName);
        } else {
          setMessage({
            ok: true,
            text: `${result.document.fileName} uploaded — ${result.document.parseStatus.toLowerCase()}.`,
          });
        }
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={(formData) => onSubmit(formData)}
      className="space-y-3"
    >
      <input type="hidden" name="form" value="resume-upload" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
          Choose file (.pdf / .docx / .txt, ≤10MB)
          <input
            type="file"
            name="file"
            accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            required
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Upload resume"}
        </button>
      </div>
      {message ? (
        <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
