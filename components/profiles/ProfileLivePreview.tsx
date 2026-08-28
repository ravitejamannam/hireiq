"use client";

import { useEffect, useState } from "react";

import { fetchLinkedPublicProof } from "@/app/actions/public-proof-actions";
import ProofOfWorkProfile from "@/components/profiles/ProofOfWorkProfile";
import type { GithubProofSnapshot } from "@/lib/profiles/github-public";
import type { LeetcodeProofSnapshot } from "@/lib/profiles/leetcode-public";
import type { StructuredProfileDraft } from "@/lib/profiles/structured-profile";

type ProfileLivePreviewProps = {
  name: string;
  location: string;
  photoUrl?: string | null;
  draft: StructuredProfileDraft;
  githubProof?: GithubProofSnapshot | null;
  leetcodeProof?: LeetcodeProofSnapshot | null;
  liveProof?: boolean;
  emptyHint?: string;
};

function hasPreviewContent(name: string, draft: StructuredProfileDraft) {
  return Boolean(
    name.trim() ||
      draft.roleTitle.trim() ||
      draft.aboutText.trim() ||
      draft.domains.length > 0 ||
      draft.githubUrl.trim() ||
      draft.leetcodeUrl.trim() ||
      draft.linkedInUrl.trim() ||
      draft.experiences.some((row) => row.title || row.company) ||
      draft.education.some((row) => row.school) ||
      draft.projects.some((row) => row.name),
  );
}

export default function ProfileLivePreview({
  name,
  location,
  photoUrl,
  draft,
  githubProof = null,
  leetcodeProof = null,
  liveProof = true,
  emptyHint = "Fill out your profile to see a live preview of how it appears to others.",
}: ProfileLivePreviewProps) {
  const [github, setGithub] = useState(githubProof);
  const [leetcode, setLeetcode] = useState(leetcodeProof);

  useEffect(() => {
    setGithub(githubProof);
    setLeetcode(leetcodeProof);
  }, [githubProof, leetcodeProof]);

  useEffect(() => {
    if (!liveProof) return;
    if (!draft.githubUrl.trim() && !draft.leetcodeUrl.trim()) {
      setGithub(null);
      setLeetcode(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetchLinkedPublicProof({
        githubUrl: draft.githubUrl || null,
        leetcodeUrl: draft.leetcodeUrl || null,
      }).then((result) => {
        setGithub(result.githubProof);
        setLeetcode(result.leetcodeProof);
      });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [draft.githubUrl, draft.leetcodeUrl, liveProof]);

  if (!hasPreviewContent(name, draft)) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-stone-500">
          Profile preview: {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <ProofOfWorkProfile
      compact
      profile={{
        name: name.trim() || "Your name",
        roleTitle: draft.roleTitle || null,
        location: location.trim() || null,
        aboutText: draft.aboutText || null,
        domains: draft.domains,
        photoUrl: photoUrl ?? null,
        githubUrl: draft.githubUrl || null,
        linkedInUrl: draft.linkedInUrl || null,
        twitterUrl: draft.twitterUrl || null,
        portfolioUrl: draft.portfolioUrl || null,
        leetcodeUrl: draft.leetcodeUrl || null,
        videoResumeUrl: draft.videoUrl || null,
        socialLinks: draft.socialLinks,
        githubProof: github,
        leetcodeProof: leetcode,
        experiences: draft.experiences.filter((row) => row.title || row.company),
        education: draft.education.filter((row) => row.school),
        projects: draft.projects.filter((row) => row.name),
      }}
    />
  );
}
