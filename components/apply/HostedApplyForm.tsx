"use client";

import { useRef, useState, type FormEvent } from "react";

type HostedApplyFormProps = {
  token: string;
};

type FieldErrors = Record<string, string>;

const inputClasses =
  "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-zinc-50 disabled:text-zinc-400";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
      {children}
    </p>
  );
}

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
  const [showSelfId, setShowSelfId] = useState(false);
  const [selfIdGender, setSelfIdGender] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [resumeClaim, setResumeClaim] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeState, setResumeState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");

  async function onResumeSelected(file: File) {
    setResumeState("uploading");
    setFormError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/apply/${encodeURIComponent(token)}/resume`,
        { method: "POST", body: form },
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; resumeClaim?: string; fileName?: string; error?: string }
        | null;
      if (!response.ok || !body?.ok || !body.resumeClaim) {
        setResumeState("error");
        setFormError(integrityFreeResumeError(body?.error));
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

  function integrityFreeResumeError(code?: string): string {
    switch (code) {
      case "UNSUPPORTED_FILE_TYPE":
        return "Only PDF and TXT resumes are supported right now.";
      case "FILE_TOO_LARGE":
        return "Resume must be 10MB or smaller.";
      case "EMPTY_FILE":
        return "That file appears to be empty.";
      case "APPLY_LINK_INVALID":
        return "This application link is no longer accepting resumes.";
      default:
        return "Resume upload failed — you can still apply without it.";
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
          selfIdGender: showSelfId && selfIdGender ? selfIdGender : undefined,
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
        setFormError(payload?.error ?? "This application link is unavailable.");
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
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h3 className="mt-3 font-bold text-emerald-900">Application received</h3>
        <p className="mt-1 text-sm text-emerald-700">
          Watch your inbox — your role assessment link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {formError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{formError}</p>
        </div>
      ) : null}

      {/* About you */}
      <fieldset className="space-y-4">
        <legend className="mb-2 w-full">
          <SectionLabel>About you</SectionLabel>
        </legend>

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Full name</span>
          <input
            className={inputClasses}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            required
            disabled={pending}
            autoComplete="name"
            placeholder="Priya Sharma"
          />
          <FieldError message={errors.name} />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Email</span>
          <input
            type="email"
            className={inputClasses}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            disabled={pending}
            autoComplete="email"
            placeholder="you@example.com"
          />
          <FieldError message={errors.email} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              Phone{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </span>
            <input
              className={inputClasses}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={32}
              disabled={pending}
              autoComplete="tel"
              placeholder="+91 98765 43210"
            />
            <FieldError message={errors.phone} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              Location{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </span>
            <input
              className={inputClasses}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={120}
              disabled={pending}
              autoComplete="address-level2"
              placeholder="Bengaluru"
            />
            <FieldError message={errors.location} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              Experience{" "}
              <span className="font-normal text-zinc-400">(years)</span>
            </span>
            <input
              type="number"
              min={0}
              max={60}
              className={inputClasses}
              value={experienceYears}
              onChange={(event) => setExperienceYears(event.target.value)}
              disabled={pending}
              placeholder="5"
            />
            <FieldError message={errors.experienceYears} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              LinkedIn{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </span>
            <input
              className={inputClasses}
              value={linkedInUrl}
              onChange={(event) => setLinkedInUrl(event.target.value)}
              maxLength={300}
              disabled={pending}
              placeholder="linkedin.com/in/you"
            />
            <FieldError message={errors.linkedInUrl} />
          </label>
        </div>
      </fieldset>

      {/* Resume */}
      <fieldset className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Resume · optional
        </legend>
        {resumeState === "ready" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            ✓ {resumeName} attached — nice, this strengthens your application.
          </p>
        ) : resumeState === "uploading" ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
            Uploading your resume…
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500">
            Attach a PDF or TXT resume and our matching engine reads it
            automatically — it strengthens how your evidence is scored.
          </p>
        )}
        <input
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onResumeSelected(file);
          }}
          disabled={pending || resumeState === "uploading"}
          className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50"
        />
      </fieldset>

      {/* Cover letter */}
      <fieldset className="space-y-2">
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">
            Why this role?{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <textarea
            value={coverLetter}
            onChange={(event) => setCoverLetter(event.target.value)}
            maxLength={8000}
            rows={4}
            disabled={pending}
            placeholder="A few honest sentences beat a formal letter."
            className={`${inputClasses} resize-y`}
          />
          <FieldError message={errors.coverLetter} />
        </label>
      </fieldset>

      {/* T138: voluntary equality information (optional) */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <button
          type="button"
          onClick={() => setShowSelfId((v) => !v)}
          className="text-sm font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
        >
          {showSelfId ? "− Hide voluntary equality information" : "+ Voluntary equality information (optional)"}
        </button>
        {showSelfId && (
          <div className="mt-3">
            <p className="text-xs leading-relaxed text-zinc-500">
              You are not required to answer. This helps the hiring company
              report on the fairness of their process in aggregate only.
              It is never shown to interviewers and never affects your
              evaluation.
            </p>
            <div className="mt-3 space-y-2">
              {[
                ["WOMAN", "Woman"],
                ["MAN", "Man"],
                ["NON_BINARY", "Non-binary"],
                ["SELF_DESCRIBE", "Prefer to self-describe"],
                ["PREFER_NOT_TO_SAY", "Prefer not to say"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="selfIdGender"
                    checked={selfIdGender === value}
                    onChange={() => setSelfIdGender(value)}
                    disabled={pending}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Consent + submit */}
      <div className="space-y-4 border-t border-zinc-200 pt-5">
        <label className="flex items-start gap-2.5 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={pending}
            required
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            I consent to HireIQ and the hiring company processing this
            application
            <FieldError message={errors.consent} />
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-indigo-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Submitting…"
            : `Submit application${resumeState === "ready" ? " + resume" : ""}`}
        </button>

        <p className="text-center text-xs text-zinc-400">
          🔒 Encrypted in transit · You&apos;ll take a short skills
          assessment next
        </p>
      </div>
    </form>
  );
}
