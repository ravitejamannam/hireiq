import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
};

import InterviewerPublicProfile from "@/components/interviewer/InterviewerPublicProfile";
import {
  getInterviewerOwnProfile,
  interviewerProfileIsPublished,
} from "@/lib/interviewers/interviewer-profile-service";
import Link from "next/link";

export default async function InterviewerProfilePage() {
  const profile = await getInterviewerOwnProfile();
  const published = interviewerProfileIsPublished(profile);

  if (!published) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Your profile
        </p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">
          Create the page others will read
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Fill in your background once. Admin, clients, and candidates you
          interview will see this page — not the form.
        </p>
        <Link
          href="/interviewer/profile/edit"
          className="mt-6 inline-flex rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white"
        >
          Fill in your profile
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-600">
        This is the page admin, clients, and candidates see when they want to
        know who is interviewing.
      </p>
      <InterviewerPublicProfile
        profile={profile}
        canEdit
        editHref="/interviewer/profile/edit"
      />
    </div>
  );
}
