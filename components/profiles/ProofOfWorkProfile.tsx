"use client";

import { useMemo, useState } from "react";

import SocialPlatformMark from "@/components/profiles/SocialPlatformMark";
import type { GithubProofSnapshot } from "@/lib/profiles/github-public";
import { languageDotColor } from "@/lib/profiles/language-colors";
import type { LeetcodeProofSnapshot } from "@/lib/profiles/leetcode-public";
import {
  githubHandleFromUrl,
  linkedInHandleFromUrl,
  socialLinksFromCanonical,
  type ProfileSocialLink,
} from "@/lib/profiles/social-platforms";
import {
  formatEducationDates,
  formatExperienceDates,
  initialsFromName,
  type ProfileEducation,
  type ProfileExperience,
  type ProfileProject,
} from "@/lib/profiles/structured-profile";

export type ProofOfWorkProfileData = {
  name: string;
  roleTitle: string | null;
  headline?: string | null;
  location: string | null;
  aboutText: string | null;
  domains: string[];
  photoUrl?: string | null;
  githubUrl: string | null;
  linkedInUrl: string | null;
  twitterUrl: string | null;
  portfolioUrl: string | null;
  leetcodeUrl: string | null;
  videoResumeUrl?: string | null;
  socialLinks: ProfileSocialLink[];
  githubProof: GithubProofSnapshot | null;
  leetcodeProof: LeetcodeProofSnapshot | null;
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
};

function heatClass(count: number) {
  if (count <= 0) return "bg-stone-200";
  if (count === 1) return "bg-emerald-200";
  if (count === 2) return "bg-emerald-400";
  if (count === 3) return "bg-emerald-500";
  return "bg-emerald-700";
}

function starLabel(count: number) {
  return count === 1 ? "1 star" : `${count} stars`;
}

function formatContributions(count: number | null) {
  if (count == null) return null;
  return `${count.toLocaleString()} contributions`;
}

export default function ProofOfWorkProfile({
  profile,
  compact = false,
}: {
  profile: ProofOfWorkProfileData;
  compact?: boolean;
}) {
  const [showAllRepos, setShowAllRepos] = useState(false);
  const role = profile.roleTitle || profile.headline || null;
  const socials = socialLinksFromCanonical({
    githubUrl: profile.githubUrl,
    linkedInUrl: profile.linkedInUrl,
    twitterUrl: profile.twitterUrl,
    portfolioUrl: profile.portfolioUrl,
    leetcodeUrl: profile.leetcodeUrl,
    extra: profile.socialLinks ?? [],
  });
  const githubHandle =
    profile.githubProof?.login ?? githubHandleFromUrl(profile.githubUrl);
  const linkedInHandle = linkedInHandleFromUrl(profile.linkedInUrl);
  const subtitle = [
    role,
    githubHandle ? `@${githubHandle}` : linkedInHandle ? `@${linkedInHandle}` : null,
    profile.location,
  ]
    .filter(Boolean)
    .join("  |  ");

  const visibleRepos = useMemo(() => {
    const repos = profile.githubProof?.repos ?? [];
    if (showAllRepos) return repos;
    return repos.slice(0, 6);
  }, [profile.githubProof, showAllRepos]);

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div
        className="h-32 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-300 sm:h-36"
        aria-hidden
      />
      <div className="px-5 pb-8 sm:px-7">
        <div className="-mt-12 flex items-end">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photoUrl}
              alt=""
              className="h-24 w-24 rounded-full border-4 border-white bg-stone-100 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-zinc-900 text-2xl font-semibold text-white shadow-sm">
              {initialsFromName(profile.name)}
            </div>
          )}
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
          {profile.name}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        ) : null}

        {profile.domains.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.domains.map((domain) => (
              <span
                key={domain}
                className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-white"
              >
                {domain}
              </span>
            ))}
          </div>
        ) : null}

        {profile.githubUrl || profile.githubProof ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-zinc-800">
                <SocialPlatformMark platform="GITHUB" className="h-5 w-5" />
                <span className="text-sm font-semibold">GitHub</span>
              </div>
              <a
                href={profile.githubProof?.htmlUrl ?? profile.githubUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-stone-500 hover:text-zinc-900"
              >
                {githubHandle ? `@${githubHandle}` : "Open profile"}
              </a>
            </div>
            {profile.githubProof ? (
              <>
                <div className="overflow-x-auto pb-1">
                  <div className="inline-grid grid-flow-col grid-rows-7 gap-[3px]">
                    {profile.githubProof.weeks.map((day, index) => (
                      <span
                        key={`${day.date}-${index}`}
                        title={
                          day.date.startsWith("pad-")
                            ? undefined
                            : `${day.date}: ${day.count}`
                        }
                        className={`h-[11px] w-[11px] rounded-[2px] ${heatClass(day.count)}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  {[
                    formatContributions(profile.githubProof.totalContributions),
                    `Total ${profile.githubProof.publicRepos} repositories`,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
                {visibleRepos.length > 0 ? (
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {visibleRepos.map((repo) => (
                      <li
                        key={repo.htmlUrl}
                        className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5"
                      >
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-zinc-900 hover:underline"
                        >
                          {repo.fullName || repo.name}
                        </a>
                        {repo.description ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-600">
                            {repo.description}
                          </p>
                        ) : null}
                        <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-stone-500">
                          {repo.language ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: languageDotColor(repo.language) }}
                              />
                              {repo.language}
                            </span>
                          ) : null}
                          <span>{starLabel(repo.stars)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(profile.githubProof.repos.length > 6 ||
                  profile.githubProof.publicRepos > 6) && (
                  <button
                    type="button"
                    onClick={() => setShowAllRepos((value) => !value)}
                    className="mt-3 text-xs font-semibold text-stone-600 underline underline-offset-2 hover:text-zinc-900"
                  >
                    {showAllRepos
                      ? "Show fewer"
                      : `Show all ${profile.githubProof.publicRepos}`}
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-stone-600">
                Public GitHub is linked. Stats could not be loaded just now —
                open the profile to verify.
              </p>
            )}
          </section>
        ) : null}

        {profile.leetcodeUrl || profile.leetcodeProof ? (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-zinc-800">
                <SocialPlatformMark platform="LEETCODE" className="h-5 w-5" />
                <span className="text-sm font-semibold">LeetCode</span>
              </div>
              <a
                href={profile.leetcodeProof?.htmlUrl ?? profile.leetcodeUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-stone-500 hover:text-zinc-900"
              >
                {profile.leetcodeProof
                  ? `@${profile.leetcodeProof.username}`
                  : "Open profile"}
              </a>
            </div>
            {profile.leetcodeProof ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="font-semibold text-zinc-900">
                  {profile.leetcodeProof.totalSolved} solved
                </span>
                <span className="text-emerald-700">
                  {profile.leetcodeProof.easy} easy
                </span>
                <span className="text-amber-700">
                  {profile.leetcodeProof.medium} medium
                </span>
                <span className="text-rose-700">
                  {profile.leetcodeProof.hard} hard
                </span>
                <span className="text-stone-500">
                  Rank{" "}
                  {profile.leetcodeProof.ranking
                    ? `#${profile.leetcodeProof.ranking.toLocaleString()}`
                    : "—"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-stone-600">
                Public LeetCode is linked. Stats could not be loaded just now.
              </p>
            )}
          </section>
        ) : null}

        {socials.length > 0 || profile.videoResumeUrl ? (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Social
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {socials.map((link) => (
                <a
                  key={`${link.platform}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.platform}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-stone-800 text-white transition hover:bg-zinc-950"
                >
                  <SocialPlatformMark platform={link.platform} className="h-4 w-4" />
                  <span className="sr-only">{link.platform}</span>
                </a>
              ))}
              {profile.videoResumeUrl ? (
                <a
                  href={profile.videoResumeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-xl bg-stone-200 px-3 text-xs font-semibold text-stone-800 hover:bg-stone-300"
                >
                  Video
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {!compact && profile.aboutText ? (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              About
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {profile.aboutText}
            </p>
          </section>
        ) : null}

        {!compact && profile.experiences.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Work experience
            </h3>
            <ul className="mt-3 space-y-4">
              {profile.experiences.map((row, index) => (
                <li key={`${row.company}-${index}`}>
                  <p className="text-sm font-semibold text-zinc-900">
                    {[row.title, row.company].filter(Boolean).join(", ")}
                  </p>
                  <p className="text-xs text-stone-500">
                    {[formatExperienceDates(row), row.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {row.summary ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                      {row.summary}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!compact && profile.education.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Education
            </h3>
            <ul className="mt-3 space-y-3">
              {profile.education.map((row, index) => (
                <li key={`${row.school}-${index}`}>
                  <p className="text-sm font-semibold text-zinc-900">{row.school}</p>
                  <p className="text-xs text-stone-500">
                    {[row.degree, row.field, formatEducationDates(row)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!compact && profile.projects.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Projects
            </h3>
            <ul className="mt-3 space-y-3">
              {profile.projects.map((row, index) => (
                <li key={`${row.name}-${index}`}>
                  <p className="text-sm font-semibold text-zinc-900">{row.name}</p>
                  {row.technologies ? (
                    <p className="text-xs text-stone-500">{row.technologies}</p>
                  ) : null}
                  {row.summary ? (
                    <p className="mt-1 text-sm text-stone-600">{row.summary}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
