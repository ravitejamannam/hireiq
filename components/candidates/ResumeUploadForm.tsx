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

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await uploadCandidateResume(candidateId, applicationId ?? null, formData);
      if (result.ok) {
        setMessage({
          ok: true,
          text: `${result.document.fileName} uploaded — ${result.document.parseStatus.toLowerCase()}.`,
        });
        formRef.current?.reset();
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
          Choose file (.pdf / .txt, ≤10MB)
          <input
            type="file"
            name="file"
            accept=".pdf,.txt,application/pdf,text/plain"
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
