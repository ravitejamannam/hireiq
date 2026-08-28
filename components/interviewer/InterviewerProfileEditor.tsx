"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { saveInterviewerProfile } from "@/app/actions/interviewer-profile-actions";
import ProfileEditorTabBar from "@/components/profiles/ProfileEditorTabBar";
import ProfileLivePreview from "@/components/profiles/ProfileLivePreview";
import StructuredProfileFields, {
  type ProfileEditorTab,
} from "@/components/profiles/StructuredProfileFields";
import type { SafeInterviewerProfile } from "@/lib/interviewers/interviewer-profile-service";
import {
  draftFromPayload,
  profileCompletenessPercent,
} from "@/lib/profiles/structured-profile";

type InterviewerProfileEditorProps = {
  initial: SafeInterviewerProfile;
};

export default function InterviewerProfileEditor({
  initial,
}: InterviewerProfileEditorProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ProfileEditorTab>("basic");
  const [name, setName] = useState(initial.name);
  const [location, setLocation] = useState(initial.location ?? "");
  const [experienceYears, setExperienceYears] = useState(
    initial.experienceYears === null ? "" : String(initial.experienceYears),
  );
  const [draft, setDraft] = useState(draftFromPayload(initial.profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setErrors({});
    setSaving(true);
    try {
      const result = await saveInterviewerProfile({
        name,
        location,
        experienceYears,
        roleTitle: draft.roleTitle,
        aboutText: draft.aboutText,
        domains: draft.domains,
        videoUrl: draft.videoUrl,
        githubUrl: draft.githubUrl,
        portfolioUrl: draft.portfolioUrl,
        twitterUrl: draft.twitterUrl,
        linkedInUrl: draft.linkedInUrl,
        leetcodeUrl: draft.leetcodeUrl,
        socialLinks: draft.socialLinks,
        experiences: draft.experiences,
        education: draft.education,
        projects: draft.projects,
      });
      if (!result.ok) {
        setError(result.error);
        if (result.fields) setErrors(result.fields);
        return;
      }
      setMessage("Profile saved.");
      router.push("/interviewer/profile");
      router.refresh();
    } catch {
      setError("Unable to save this profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Your profile
          </p>
          <p className="text-xs font-medium text-zinc-500">{completeness}% complete</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-rose-800 transition-[width]"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}

      <ProfileEditorTabBar tab={tab} onChange={setTab} disabled={saving} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <StructuredProfileFields
            tab={tab}
            draft={draft}
            onChange={setDraft}
            errors={errors}
            disabled={saving}
            basicSlot={
              <>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={200}
                    disabled={saving}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-black"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">Location</span>
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    disabled={saving}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-black"
                    placeholder="Bengaluru"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">
                    Years of experience
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={experienceYears}
                    onChange={(event) => setExperienceYears(event.target.value)}
                    disabled={saving}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-black"
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  Category is set by HireIQ ({initial.category.replaceAll("_", " ")}
                  ) and is not edited here.
                </p>
              </>
            }
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
        <div className="lg:sticky lg:top-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Live preview
          </p>
          <ProfileLivePreview
            name={name}
            location={location}
            draft={draft}
            githubProof={initial.githubProof}
            leetcodeProof={initial.leetcodeProof}
          />
        </div>
      </div>
    </form>
  );
}
