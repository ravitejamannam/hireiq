import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit profile",
};

import InterviewerProfileEditor from "@/components/interviewer/InterviewerProfileEditor";
import { getInterviewerOwnProfile } from "@/lib/interviewers/interviewer-profile-service";
import Link from "next/link";

export default async function InterviewerProfileEditPage() {
  const profile = await getInterviewerOwnProfile();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/interviewer/profile"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to profile page
        </Link>
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Edit your profile</h1>
        <p className="mt-2 text-zinc-600">
          After you save, HireIQ publishes a profile page. That page is what
          admin, clients, and candidates read — this form stays private to you.
        </p>
      </div>
      <InterviewerProfileEditor initial={profile} />
    </div>
  );
}
