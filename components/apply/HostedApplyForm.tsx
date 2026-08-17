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
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            errors?: FieldErrors;
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
