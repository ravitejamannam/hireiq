"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateCandidateProfile } from "@/app/actions/candidate-profile-actions";
import ProfileEditorTabBar from "@/components/profiles/ProfileEditorTabBar";
import ProfileLivePreview from "@/components/profiles/ProfileLivePreview";
import StructuredProfileFields, {
  type ProfileEditorTab,
} from "@/components/profiles/StructuredProfileFields";
import type { SafeCandidateProfile } from "@/lib/candidates/candidate-profile-types";
import { draftFromPayload } from "@/lib/profiles/structured-profile";

type CandidateProfileFormProps = {
  profile: SafeCandidateProfile;
};

export default function CandidateProfileForm({
  profile,
}: CandidateProfileFormProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ProfileEditorTab>("basic");
  const [name, setName] = useState(profile.name);
  const [location, setLocation] = useState(profile.location ?? "");
  const [experienceYears, setExperienceYears] = useState(
    profile.experienceYears === null ? "" : String(profile.experienceYears),
  );
  const [currentEmployer, setCurrentEmployer] = useState(
    profile.currentEmployer ?? "",
  );
  const [skillsText, setSkillsText] = useState(profile.skillsText ?? "");
  const [expectedCTC, setExpectedCTC] = useState(profile.expectedCTC ?? "");
  const [draft, setDraft] = useState(
    draftFromPayload({
      roleTitle: profile.roleTitle ?? profile.headline,
      aboutText: profile.aboutText,
      domains: profile.domains,
      videoUrl: profile.videoResumeUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      twitterUrl: profile.twitterUrl,
      linkedInUrl: profile.linkedInUrl,
      leetcodeUrl: profile.leetcodeUrl,
      socialLinks: profile.socialLinks,
      experiences: profile.experiences,
      education: profile.education,
      projects: profile.projects,
    }),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);

    try {
      const result = await updateCandidateProfile(profile.candidateId, {
        name,
        headline: draft.roleTitle,
        location,
        experienceYears,
        currentEmployer,
        skillsText,
        expectedCTC,
        linkedInUrl: draft.linkedInUrl,
        roleTitle: draft.roleTitle,
        aboutText: draft.aboutText,
        domains: draft.domains,
        videoUrl: draft.videoUrl,
        githubUrl: draft.githubUrl,
        portfolioUrl: draft.portfolioUrl,
        twitterUrl: draft.twitterUrl,
        leetcodeUrl: draft.leetcodeUrl,
        socialLinks: draft.socialLinks,
        experiences: draft.experiences,
        education: draft.education,
        projects: draft.projects,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Profile saved.");
      router.push(`/dashboard/candidates/${profile.candidateId}`);
      router.refresh();
    } catch {
      setError("Unable to save this profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <ProfileEditorTabBar tab={tab} onChange={setTab} disabled={isSaving} />

          <StructuredProfileFields
            tab={tab}
            draft={draft}
            onChange={setDraft}
            disabled={isSaving}
            basicSlot={
              <>
                <label className="block text-sm text-zinc-600">
                  <span className="font-medium text-black">Name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-black outline-none focus:border-black"
                  />
                </label>
                <label className="block text-sm text-zinc-600">
                  <span className="font-medium text-black">Location</span>
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-black outline-none focus:border-black"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-zinc-600">
                    <span className="font-medium text-black">
                      Experience (years)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={80}
                      value={experienceYears}
                      onChange={(event) =>
                        setExperienceYears(event.target.value)
                      }
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-black outline-none focus:border-black"
                    />
                  </label>
                  <label className="block text-sm text-zinc-600">
                    <span className="font-medium text-black">
                      Current employer
                    </span>
                    <input
                      value={currentEmployer}
                      onChange={(event) =>
                        setCurrentEmployer(event.target.value)
                      }
                      className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-black outline-none focus:border-black"
                    />
                  </label>
                </div>
                <label className="block text-sm text-zinc-600">
                  <span className="font-medium text-black">Expected CTC</span>
                  <input
                    value={expectedCTC}
                    onChange={(event) => setExpectedCTC(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-black outline-none focus:border-black"
                  />
                </label>
                <label className="block text-sm text-zinc-600">
                  <span className="font-medium text-black">Skills</span>
                  <textarea
                    value={skillsText}
                    onChange={(event) => setSkillsText(event.target.value)}
                    rows={3}
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-black outline-none focus:border-black"
                  />
                </label>
              </>
            }
            integrationsSlot={
              <p className="text-sm leading-relaxed text-zinc-600">
                Resume files stay on the evidence panel. Photo is collected at
                apply.
              </p>
            }
          />

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </div>

        <div className="lg:sticky lg:top-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Live preview
          </p>
          <ProfileLivePreview
            name={name}
            location={location}
            photoUrl={profile.photoUrl}
            draft={draft}
            githubProof={profile.githubProof}
            leetcodeProof={profile.leetcodeProof}
          />
        </div>
      </div>
    </form>
  );
}
