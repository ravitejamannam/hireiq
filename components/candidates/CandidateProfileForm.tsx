"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateCandidateProfile } from "@/app/actions/candidate-profile-actions";
import type { SafeCandidateProfile } from "@/lib/candidates/candidate-profile-types";

type CandidateProfileFormProps = {
  profile: SafeCandidateProfile;
};

export default function CandidateProfileForm({
  profile,
}: CandidateProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [experienceYears, setExperienceYears] = useState(
    profile.experienceYears === null ? "" : String(profile.experienceYears),
  );
  const [currentEmployer, setCurrentEmployer] = useState(
    profile.currentEmployer ?? "",
  );
  const [skillsText, setSkillsText] = useState(profile.skillsText ?? "");
  const [expectedCTC, setExpectedCTC] = useState(profile.expectedCTC ?? "");
  const [linkedInUrl, setLinkedInUrl] = useState(profile.linkedInUrl ?? "");
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
        headline,
        location,
        experienceYears,
        currentEmployer,
        skillsText,
        expectedCTC,
        linkedInUrl,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Profile saved.");
      router.refresh();
    } catch {
      setError("Unable to save this profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Basic information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-zinc-600">
            <span className="font-medium text-black">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
          <label className="block text-sm text-zinc-600">
            <span className="font-medium text-black">Headline</span>
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder="Not provided"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
          <label className="block text-sm text-zinc-600 sm:col-span-2">
            <span className="font-medium text-black">Location</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Professional information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-zinc-600">
            <span className="font-medium text-black">Experience (years)</span>
            <input
              type="number"
              min={0}
              max={80}
              value={experienceYears}
              onChange={(event) => setExperienceYears(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
          <label className="block text-sm text-zinc-600">
            <span className="font-medium text-black">Current employer</span>
            <input
              value={currentEmployer}
              onChange={(event) => setCurrentEmployer(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
          <label className="block text-sm text-zinc-600 sm:col-span-2">
            <span className="font-medium text-black">Skills</span>
            <textarea
              value={skillsText}
              onChange={(event) => setSkillsText(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
          <label className="block text-sm text-zinc-600 sm:col-span-2">
            <span className="font-medium text-black">LinkedIn URL</span>
            <input
              value={linkedInUrl}
              onChange={(event) => setLinkedInUrl(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Compensation</h2>
        <label className="mt-4 block text-sm text-zinc-600">
          <span className="font-medium text-black">Expected CTC</span>
          <input
            value={expectedCTC}
            onChange={(event) => setExpectedCTC(event.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-black outline-none focus:border-black"
          />
        </label>
      </section>

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
