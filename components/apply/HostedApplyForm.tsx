"use client";

import { useRef, useState, type FormEvent } from "react";

type HostedApplyFormProps = {
  token: string;
};

type FieldErrors = Record<string, string>;

export default function HostedApplyForm({ token }: HostedApplyFormProps) {
  const idempotencyKey = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [resumeClaim, setResumeClaim] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeState, setResumeState] = useState<"idle" | "uploading" | "ready" | "error">("idle");

  async function onResumeSelected(file: File) {
    setResumeState("uploading");
    setFormError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/apply/${encodeURIComponent(token)}/resume`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; resumeClaim?: string; fileName?: string; error?: string }
        | null;
      if (!response.ok || !body?.ok || !body.resumeClaim) {
        setResumeState("error");
        setFormError(
          body?.error === "UNSUPPORTED_FILE_TYPE"
            ? "Only PDF and TXT resumes are supported."
            : body?.error === "FILE_TOO_LARGE"
              ? "Resume must be 10MB or smaller."
              : body?.error === "APPLY_LINK_INVALID"
                ? "This application link is no longer accepting resumes."
                : "Resume upload failed — you can still apply without it.",
        );
        return;
      }
      setResumeClaim(body.resumeClaim);
      setResumeName(body.fileName ?? file.name);
      setResumeState("ready");
    } catch {
      setResumeState("error");
      setFormError("Resume upload failed — you can still apply without it.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setPending(true);

    try {
      if (!idempotencyKey.current) {
        idempotencyKey.current = crypto.randomUUID();
      }
      const response = await fetch(`/api/apply/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          name,
          email,
          phone: phone || null,
          location: location || null,
          experienceYears: experienceYears || null,
          linkedInUrl: linkedInUrl || null,
          coverLetter: coverLetter || null,
          consent,
          resumeClaim,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            errors?: FieldErrors;
            assessmentUrl?: string | null;
          }
        | null;

      if (response.status === 429) {
        setFormError("Too many attempts. Try again later.");
        return;
      }

      if (payload?.errors) {
        setErrors(payload.errors);
        setFormError(payload.error ?? "Please correct the highlighted fields.");
        return;
      }

      if (!response.ok || !payload?.success) {
        setFormError(
          payload?.error ?? "This application link is unavailable.",
        );
        return;
      }

      if (payload.assessmentUrl) {
        window.location.assign(payload.assessmentUrl);
        return;
      }

      setSubmitted(true);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Your application was received.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      ) : null}

      <label className="block text-sm font-medium text-black">
        Full name
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          required
          disabled={pending}
          autoComplete="name"
        />
        {errors.name ? (
          <span className="mt-1 block text-sm text-red-600">{errors.name}</span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-black">
        Email
        <input
          type="email"
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          required
          disabled={pending}
          autoComplete="email"
        />
        {errors.email ? (
          <span className="mt-1 block text-sm text-red-600">{errors.email}</span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-black">
        Phone <span className="font-normal text-zinc-500">(optional)</span>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={32}
          disabled={pending}
          autoComplete="tel"
        />
        {errors.phone ? (
          <span className="mt-1 block text-sm text-red-600">{errors.phone}</span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-black">
        Location <span className="font-normal text-zinc-500">(optional)</span>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          maxLength={200}
          disabled={pending}
          autoComplete="address-level2"
        />
        {errors.location ? (
          <span className="mt-1 block text-sm text-red-600">{errors.location}</span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-black">
        Years of experience{" "}
        <span className="font-normal text-zinc-500">(optional)</span>
        <input
          type="number"
          min={0}
          max={80}
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={experienceYears}
          onChange={(event) => setExperienceYears(event.target.value)}
          disabled={pending}
        />
        {errors.experienceYears ? (
          <span className="mt-1 block text-sm text-red-600">
            {errors.experienceYears}
          </span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-black">
        LinkedIn URL{" "}
        <span className="font-normal text-zinc-500">(optional)</span>
        <input
          type="url"
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={linkedInUrl}
          onChange={(event) => setLinkedInUrl(event.target.value)}
          maxLength={2048}
          disabled={pending}
          placeholder="https://www.linkedin.com/in/you"
        />
        {errors.linkedInUrl ? (
          <span className="mt-1 block text-sm text-red-600">
            {errors.linkedInUrl}
          </span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-black">
        Cover letter{" "}
        <span className="font-normal text-zinc-500">(optional)</span>
        <textarea
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
          value={coverLetter}
          onChange={(event) => setCoverLetter(event.target.value)}
          maxLength={8000}
          rows={6}
          disabled={pending}
        />
        {errors.coverLetter ? (
          <span className="mt-1 block text-sm text-red-600">
            {errors.coverLetter}
          </span>
        ) : null}
      </label>

      <div>
        <p className="text-sm font-medium text-black">Resume (optional)</p>
        <p className="mt-1 text-xs text-zinc-500">PDF or TXT, up to 10MB.</p>
        {resumeState === "ready" ? (
          <p className="mt-2 text-sm font-medium text-emerald-600">
            ✓ {resumeName} attached
          </p>
        ) : resumeState === "uploading" ? (
          <p className="mt-2 text-sm text-zinc-500">Uploading…</p>
        ) : null}
        <input
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onResumeSelected(file);
          }}
          disabled={pending || resumeState === "uploading"}
          className="mt-2 block w-full cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-zinc-700"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-black">
        <input
          type="checkbox"
          className="mt-1"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={pending}
          required
        />
        <span>
          I consent to HireIQ and the hiring company processing this application
          for this role.
        </span>
      </label>
      {errors.consent ? (
        <p className="text-sm text-red-600">{errors.consent}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
