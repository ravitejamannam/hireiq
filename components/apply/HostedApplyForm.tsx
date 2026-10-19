"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import {
  certificationReviewList,
  fillEmptyProfileFromSuggestion,
} from "@/lib/apply/resume-suggestion";
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
  expectsAssessment?: boolean;
  knockouts?: Array<{ id: number; prompt: string }>;
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
  expectsAssessment = true,
  knockouts = [],
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
  const [futureRoles, setFutureRoles] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [resumeClaim, setResumeClaim] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumePreview, setResumePreview] = useState<string | null>(null);
  const [certificationReview, setCertificationReview] = useState<string[]>([]);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [resumeState, setResumeState] = useState<
    "idle" | "uploading" | "parsing" | "ready" | "error"
  >("idle");
  const [photoClaim, setPhotoClaim] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [knockoutAnswers, setKnockoutAnswers] = useState<Record<number, string>>({});

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

  function applyResumeSuggestion(body: {
    parseStatus?: string;
    parseErrorCode?: string | null;
    fieldsNeedReview?: boolean;
    extractedPreview?: string | null;
    suggestion?: {
      fullName: string | null;
      email: string | null;
      phone: string | null;
      skills: string[];
      experiences: Array<{ title: string; company: string; startDate: string; endDate: string; tenure: string }>;
      education: Array<{ credential: string; institution: string }>;
      projects: Array<{ name: string }>;
      certifications?: string[];
    } | null;
  }) {
    setResumePreview(body.extractedPreview ?? null);
    setResumeNotice(
      body.parseStatus === "FAILED"
        ? integrityFreeResumeError(body.parseErrorCode ?? undefined)
        : body.fieldsNeedReview || body.parseErrorCode === "NEEDS_REVIEW"
          ? "We read this file. Check the fields below; some could not be filled automatically."
          : body.parseErrorCode === "LOW_QUALITY"
            ? "We read this file, but the text looks incomplete. Check it below and fill in anything missing in your profile."
            : null,
    );
    const suggestion = body.suggestion;
    if (!suggestion) return;
    if (suggestion.fullName) setName((current) => current || suggestion.fullName || "");
    if (suggestion.email) setEmail((current) => current || suggestion.email || "");
    if (suggestion.phone) setPhone((current) => current || suggestion.phone || "");
    if (suggestion.experiences.length > 0 || suggestion.education.length > 0 || suggestion.projects.length > 0) {
      setDraft((current) => fillEmptyProfileFromSuggestion(current, {
        ...suggestion,
        skills: suggestion.skills ?? [],
        certifications: suggestion.certifications ?? [],
      }));
    }
    const certifications = certificationReviewList(suggestion.certifications);
    if (certifications.length > 0) {
      setCertificationReview((current) => (current.some((value) => value.trim()) ? current : certifications));
    }
  }

  async function pollResumeParse(applyToken: string, claim: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(
        `/api/apply/${encodeURIComponent(applyToken)}/resume/status?claim=${encodeURIComponent(claim)}`,
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; parseStatus?: string }
        | null;
      if (!response.ok || !body?.ok || body.parseStatus === "PARSING") continue;
      applyResumeSuggestion(body as Parameters<typeof applyResumeSuggestion>[0]);
      setResumeState(body.parseStatus === "FAILED" ? "error" : "ready");
      return;
    }
    setResumeNotice("Still reading the resume. You can keep typing and submit without waiting.");
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
        | {
            ok?: boolean;
            resumeClaim?: string;
            fileName?: string;
            message?: string;
            error?: string;
            parseStatus?: string;
            parseErrorCode?: string | null;
            extractedPreview?: string | null;
            suggestion?: {
              fullName: string | null;
              email: string | null;
              phone: string | null;
              skills: string[];
              experiences: Array<{
                title: string;
                company: string;
                startDate: string;
                endDate: string;
                tenure: string;
              }>;
              education: Array<{ credential: string; institution: string }>;
              projects: Array<{ name: string }>;
              certifications?: string[];
            } | null;
          }
        | null;
      if (!response.ok || !body?.ok || !body.resumeClaim) {
        setResumeState("error");
        setFormError(body?.message || integrityFreeResumeError(body?.error));
        return;
      }
      setResumeClaim(body.resumeClaim);
      setResumeName(body.fileName ?? file.name);
      if (body.parseStatus === "PARSING") {
        setResumeState("parsing");
        void pollResumeParse(token, body.resumeClaim);
        return;
      }
      applyResumeSuggestion(body);
      setResumeState("ready");
    } catch {
      setResumeState("error");
      setFormError("Resume upload failed — you can still apply without it.");
    }
  }

  function integrityFreeResumeError(code?: string): string {
    switch (code) {
      case "UNSUPPORTED_FILE_TYPE":
      case "UNSUPPORTED_FORMAT":
        return "Upload a PDF, Word (.docx), or plain text file. Photos, older Word .doc files, and zip archives are not accepted.";
      case "LEGACY_DOC_UNSUPPORTED":
        return "Older Word .doc files are not supported. Save the resume as PDF or DOCX and upload that.";
      case "FILE_TOO_LARGE":
        return "Resume must be 10MB or smaller.";
      case "EMPTY_FILE":
        return "That file appears to be empty.";
      case "OCR_DEFERRED":
        return "This looks like a scan. The file is saved. Reading it can take a while. If it stays unreadable, upload a text-based PDF or DOCX, and type your experience below in the meantime.";
      case "OCR_EXHAUSTED":
        return "We could not read this scan. Upload a text-based PDF or DOCX instead, and type your experience in the profile below.";
      case "PDF_NO_TEXT_LAYER":
        return "This PDF has no readable text. The file is saved. Please type your experience in the profile below.";
      case "PARSE_TIMEOUT":
        return "This file took too long to read. It is saved. Please type your experience in the profile below.";
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
          futureRolesConsent: futureRoles,
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
          knockoutAnswers: knockouts.map((question) => ({
            questionId: question.id,
            answer: knockoutAnswers[question.id] ?? "",
          })),
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
          {expectsAssessment
            ? "We could not open the role assessment just now. The hiring team still has your profile."
            : "Your profile is with the hiring team. This role does not include an online assessment."}
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
            Optional · PDF, DOCX, or TXT · stored as evidence, not as your profile
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center">
          <span className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
            {resumeState === "ready"
              ? "Replace resume"
              : resumeState === "uploading"
                ? "Uploading…"
                : resumeState === "parsing"
                  ? "Reading your resume…"
                  : "Upload resume"}
          </span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onResumeSelected(file);
            }}
            disabled={pending || resumeState === "uploading"}
            className="sr-only"
          />
        </label>
      </div>
      {resumeState === "parsing" ? (
        <p className="text-sm text-zinc-600" role="status">Reading your resume… You can keep filling the form.</p>
      ) : null}
      {resumeState === "ready" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-700">✓ {resumeName} attached</p>
          {resumeNotice ? (
            <p className="text-sm text-amber-800">{resumeNotice}</p>
          ) : null}
          {certificationReview.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="text-sm font-medium text-zinc-800">Certifications we read</p>
              <p className="text-xs text-zinc-500">
                Review or edit these notes. They are not saved with the application.
              </p>
              {certificationReview.map((value, index) => (
                <input
                  key={`certification-${index}`}
                  value={value}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCertificationReview((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? next : item)),
                    );
                  }}
                  disabled={pending}
                  className={inputClasses}
                />
              ))}
            </div>
          ) : null}
          {resumePreview ? (
            <details className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">
                Check what we read
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-600">
                {resumePreview}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Correct anything wrong in the profile fields below. Those fields are what we keep.
              </p>
            </details>
          ) : null}
        </div>
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

      {knockouts.length > 0 ? (
        <fieldset className="space-y-4 border-t border-zinc-200 pt-5">
          <legend className="text-sm font-semibold text-zinc-900">
            Required answers
          </legend>
          <p className="text-sm text-zinc-600">
            A wrong answer on these questions rejects the application by rule.
          </p>
          {knockouts.map((question) => (
            <label key={question.id} className="block">
              <span className="text-sm font-medium text-zinc-800">{question.prompt}</span>
              <input
                value={knockoutAnswers[question.id] ?? ""}
                onChange={(event) =>
                  setKnockoutAnswers((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
                required
                disabled={pending}
                className={inputClasses}
              />
            </label>
          ))}
        </fieldset>
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
        <label className="flex items-start gap-2.5 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={futureRoles}
            onChange={(event) => setFutureRoles(event.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Also consider me for future roles at this company. This is optional and starts off.</span>
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
