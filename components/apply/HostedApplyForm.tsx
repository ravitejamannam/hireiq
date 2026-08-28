"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import StructuredProfileFields, {
  type ProfileEditorTab,
} from "@/components/profiles/StructuredProfileFields";
import ProfileEditorTabBar from "@/components/profiles/ProfileEditorTabBar";
import {
  emptyStructuredDraft,
  profileCompletenessPercent,
  type StructuredProfileDraft,
} from "@/lib/profiles/structured-profile";

type HostedApplyFormProps = {
  token: string;
  compact?: boolean;
};

type FieldErrors = Record<string, string>;

const inputClasses =
  "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-zinc-50 disabled:text-zinc-400";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

function tabForError(errors: FieldErrors): ProfileEditorTab | null {
  const keys = Object.keys(errors);
  if (keys.some((key) => key.startsWith("experiences"))) return "experience";
  if (keys.some((key) => key.startsWith("education"))) return "education";
  if (keys.some((key) => key.startsWith("projects"))) return "projects";
  if (
    keys.some((key) =>
      [
        "linkedInUrl",
        "githubUrl",
        "portfolioUrl",
        "twitterUrl",
        "leetcodeUrl",
      ].includes(key) || key.startsWith("socialLinks"),
    )
  ) {
    return "socials";
  }
  if (keys.includes("resume")) return "integrations";
  if (keys.includes("photo")) return "basic";
  if (
    keys.some((key) =>
      [
        "name",
        "email",
        "phone",
        "location",
        "roleTitle",
        "aboutText",
        "domains",
        "videoUrl",
        "experienceYears",
      ].includes(key),
    )
  ) {
    return "basic";
  }
  return null;
}

export default function HostedApplyForm({
  token,
}: HostedApplyFormProps) {
  const idempotencyKey = useRef<string | null>(null);
  const [tab, setTab] = useState<ProfileEditorTab>("basic");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [draft, setDraft] = useState<StructuredProfileDraft>(emptyStructuredDraft);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [resumeClaim, setResumeClaim] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeState, setResumeState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [photoClaim, setPhotoClaim] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");

  const completeness = useMemo(
    () =>
      profileCompletenessPercent({
        name,
        location,
        roleTitle: draft.roleTitle,
        aboutText: draft.aboutText,
        domains: draft.domains,
        experiences: draft.experiences,
        education: draft.education,
        linkedInUrl: draft.linkedInUrl,
        githubUrl: draft.githubUrl,
        portfolioUrl: draft.portfolioUrl,
      }),
    [name, location, draft],
  );

  function integrityFreePhotoError(code?: string): string {
    switch (code) {
      case "UNSUPPORTED_FILE_TYPE":
        return "Use a JPG, PNG, or WebP photo.";
      case "FILE_TOO_LARGE":
        return "Photo must be 2MB or smaller.";
      case "EMPTY_FILE":
        return "That file appears to be empty.";
      case "APPLY_LINK_INVALID":
        return "This application link is no longer accepting uploads.";
      default:
        return "Photo upload failed — you can still apply without it.";
    }
  }

  async function onPhotoSelected(file: File) {
    setPhotoState("uploading");
    setFormError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/apply/${encodeURIComponent(token)}/photo`,
        { method: "POST", body: form },
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; photoClaim?: string; error?: string }
        | null;
      if (!response.ok || !body?.ok || !body.photoClaim) {
        setPhotoState("error");
        setFormError(integrityFreePhotoError(body?.error));
        return;
      }
      setPhotoClaim(body.photoClaim);
      setPhotoPreview(URL.createObjectURL(file));
      setPhotoState("ready");
    } catch {
      setPhotoState("error");
      setFormError("Photo upload failed — you can still apply without it.");
    }
  }

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
          coverLetter: coverLetter || null,
          consent,
          resumeClaim,
          photoClaim,
          roleTitle: draft.roleTitle || null,
          aboutText: draft.aboutText || null,
          domains: draft.domains,
          videoUrl: draft.videoUrl || null,
          githubUrl: draft.githubUrl || null,
          portfolioUrl: draft.portfolioUrl || null,
          twitterUrl: draft.twitterUrl || null,
          linkedInUrl: draft.linkedInUrl || null,
          leetcodeUrl: draft.leetcodeUrl || null,
          socialLinks: draft.socialLinks,
          experiences: draft.experiences,
          education: draft.education,
          projects: draft.projects,
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
        const firstTab = tabForError(payload.errors);
        if (firstTab) setTab(firstTab);
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
          Your candidate profile is ready — watch your inbox for the role
          assessment.
        </p>
      </div>
    );
  }

  const basicSlot = (
    <>
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              Photo
            </div>
          )}
        </div>
        <label className="block flex-1">
          <span className="text-sm font-medium text-zinc-800">
            Profile picture{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onPhotoSelected(file);
            }}
            disabled={pending || photoState === "uploading"}
            className="mt-1.5 block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-zinc-500">
            JPG, PNG, or WebP · 2MB max
            {photoState === "uploading" ? " · Uploading…" : ""}
            {photoState === "ready" ? " · Attached" : ""}
          </p>
          <FieldError message={errors.photo} />
        </label>
      </div>
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
            Phone <span className="font-normal text-zinc-400">(optional)</span>
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
          <span className="text-sm font-medium text-zinc-800">Location</span>
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
      <label className="block">
        <span className="text-sm font-medium text-zinc-800">
          Years of experience
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
    </>
  );

  const integrationsSlot = (
    <p className="text-sm leading-relaxed text-zinc-500">
      Résumé upload sits above this form. Calendar and ATS connections are not
      part of apply.
    </p>
  );

  const formColumn = (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {formError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{formError}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Resume</p>
          <p className="text-xs text-zinc-500">
            Optional · PDF or TXT · stored as evidence, not as your profile
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center">
          <span className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
            {resumeState === "ready"
              ? "Replace resume"
              : resumeState === "uploading"
                ? "Uploading…"
                : "Upload resume"}
          </span>
          <input
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onResumeSelected(file);
            }}
            disabled={pending || resumeState === "uploading"}
            className="sr-only"
          />
        </label>
      </div>
      {resumeState === "ready" ? (
        <p className="text-sm font-medium text-emerald-700">
          ✓ {resumeName} attached
        </p>
      ) : null}
      <FieldError message={errors.resume} />

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Your profile
          </p>
          <p className="text-xs font-medium text-zinc-500">
            {completeness}% complete
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-rose-800 transition-[width]"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      <ProfileEditorTabBar tab={tab} onChange={setTab} disabled={pending} />

      <StructuredProfileFields
        tab={tab}
        draft={draft}
        onChange={setDraft}
        errors={errors}
        disabled={pending}
        inputClassName={inputClasses}
        basicSlot={basicSlot}
        integrationsSlot={integrationsSlot}
      />

      {tab === "basic" ? (
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">
            Why this role?{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <textarea
            value={coverLetter}
            onChange={(event) => setCoverLetter(event.target.value)}
            maxLength={8000}
            rows={3}
            disabled={pending}
            placeholder="A few honest sentences beat a formal letter."
            className={`${inputClasses} resize-y`}
          />
          <FieldError message={errors.coverLetter} />
        </label>
      ) : null}

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
          Encrypted in transit · Your answers become a candidate profile the
          hiring team can read
        </p>
      </div>
    </form>
  );

  return formColumn;
}
