"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Link2, Pencil } from "lucide-react";

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
  currentRoleSummary,
  formatEducationDates,
  formatExperienceDates,
  initialsFromName,
  type ProfileEducation,
  type ProfileExperience,
  type ProfileProject,
} from "@/lib/profiles/structured-profile";

export type PersonProfileViewData = {
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
  experienceYears?: number | null;
};

type ProfileSection = "about" | "experience" | "education" | "integrations";

const SECTIONS: Array<{ id: ProfileSection; label: string }> = [
  { id: "about", label: "About" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "integrations", label: "Integrations" },
];

function heatClass(count: number) {
  if (count <= 0) return "bg-stone-200";
  if (count === 1) return "bg-emerald-200";
  if (count === 2) return "bg-emerald-400";
  if (count === 3) return "bg-emerald-500";
  return "bg-emerald-700";
}

function letterMark(label: string) {
  return label.trim()[0]?.toUpperCase() ?? "•";
}

function Card({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"
    >
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function PersonProfileView({
  profile,
  personKind,
  canEdit = false,
  editHref,
  emptyHint,
}: {
  profile: PersonProfileViewData;
  personKind: "candidate" | "interviewer";
  canEdit?: boolean;
  editHref?: string;
  emptyHint?: string;
}) {
  const [section, setSection] = useState<ProfileSection>("about");
  const [showAllRepos, setShowAllRepos] = useState(false);
  const [copied, setCopied] = useState(false);

  const role = profile.roleTitle || profile.headline || null;
  const githubHandle =
    profile.githubProof?.login ?? githubHandleFromUrl(profile.githubUrl);
  const linkedInHandle = linkedInHandleFromUrl(profile.linkedInUrl);
  const handle = githubHandle
    ? `@${githubHandle}`
    : linkedInHandle
      ? `@${linkedInHandle}`
      : null;
  const socials = socialLinksFromCanonical({
    githubUrl: profile.githubUrl,
    linkedInUrl: profile.linkedInUrl,
    twitterUrl: profile.twitterUrl,
    portfolioUrl: profile.portfolioUrl,
    leetcodeUrl: profile.leetcodeUrl,
    extra: profile.socialLinks ?? [],
  });
  const current = currentRoleSummary(profile.experiences);
  const roleCount = profile.experiences.filter(
    (row) => row.title.trim() && row.company.trim(),
  ).length;
  const visibleRepos = useMemo(() => {
    const repos = profile.githubProof?.repos ?? [];
    return showAllRepos ? repos : repos.slice(0, 6);
  }, [profile.githubProof, showAllRepos]);

  function scrollTo(id: ProfileSection) {
    setSection(id);
    document.getElementById(`profile-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const firstName = profile.name.trim().split(/\s+/)[0] || "them";

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div
          className="h-36 bg-linear-to-br from-amber-200 via-orange-200 to-rose-300 sm:h-44"
          aria-hidden
        />
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            {profile.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoUrl}
                alt=""
                className="h-24 w-24 rounded-2xl border-4 border-white bg-stone-100 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-zinc-900 text-2xl font-semibold text-white shadow-sm">
                {initialsFromName(profile.name)}
              </div>
            )}
            <div className="mb-1 flex flex-wrap gap-2">
              {canEdit && editHref ? (
                <Link
                  href={editHref}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-stone-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 hover:bg-stone-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Share profile"}
              </button>
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900">
            {profile.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {[role, handle, profile.location].filter(Boolean).join("  ·  ")}
          </p>
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
        </div>
      </header>

      <div className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-stone-50/90 py-2 backdrop-blur">
        {SECTIONS.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollTo(item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-stone-200 text-zinc-900"
                  : "text-zinc-600 hover:bg-stone-100"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <Card id="profile-about" title="About Me">
            {profile.aboutText?.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                {profile.aboutText}
              </p>
            ) : (
              <p className="text-sm text-stone-500">
                {emptyHint ?? "No summary added yet."}
              </p>
            )}
          </Card>

          <Card id="profile-experience" title="Work Experience">
            {profile.experiences.length === 0 ? (
              <p className="text-sm text-stone-500">No work experience listed.</p>
            ) : (
              <ul className="space-y-5">
                {profile.experiences.map((row, index) => (
                  <li
                    key={`${row.company}-${index}`}
                    className="flex gap-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-sm font-semibold text-zinc-700">
                      {letterMark(row.company || row.title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            {row.title}
                          </p>
                          <p className="text-sm text-stone-600">{row.company}</p>
                        </div>
                        <p className="text-xs text-stone-500">
                          {formatExperienceDates(row)}
                        </p>
                      </div>
                      {row.summary ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                          {row.summary}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="profile-education" title="Education">
            {profile.education.length === 0 ? (
              <p className="text-sm text-stone-500">No education listed.</p>
            ) : (
              <ul className="space-y-5">
                {profile.education.map((row, index) => (
                  <li key={`${row.school}-${index}`} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-sm font-semibold text-zinc-700">
                      {letterMark(row.school)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            {row.school}
                          </p>
                          <p className="text-sm text-stone-600">
                            {[row.degree, row.field].filter(Boolean).join(", ")}
                          </p>
                        </div>
                        <p className="text-xs text-stone-500">
                          {formatEducationDates(row)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section id="profile-integrations" className="scroll-mt-24 space-y-4">
            {profile.githubUrl || profile.githubProof ? (
              <Card title="GitHub">
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
                      {profile.githubProof.totalContributions != null
                        ? `${profile.githubProof.totalContributions.toLocaleString()} contributions`
                        : null}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-zinc-900">
                      Total {profile.githubProof.publicRepos} repositories
                    </p>
                    {visibleRepos.length > 0 ? (
                      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {visibleRepos.map((repo) => (
                          <li
                            key={repo.htmlUrl}
                            className="rounded-xl border border-stone-200 bg-stone-50/80 p-3.5"
                          >
                            <a
                              href={repo.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-sky-800 hover:underline"
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
                                    style={{
                                      backgroundColor: languageDotColor(repo.language),
                                    }}
                                  />
                                  {repo.language}
                                </span>
                              ) : (
                                <span>Unknown</span>
                              )}
                              <span>★ {repo.stars}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {profile.githubProof.publicRepos > 6 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllRepos((value) => !value)}
                        className="mt-3 text-xs font-semibold text-stone-600 underline underline-offset-2"
                      >
                        {showAllRepos
                          ? "Show fewer"
                          : `Show all ${profile.githubProof.publicRepos}`}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-stone-600">
                    Public GitHub is linked. Stats could not be loaded just now.
                  </p>
                )}
              </Card>
            ) : null}

            {profile.leetcodeUrl || profile.leetcodeProof ? (
              <Card title="LeetCode">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-zinc-800">
                    <SocialPlatformMark platform="LEETCODE" className="h-5 w-5" />
                    <span className="text-sm font-semibold">LeetCode</span>
                  </div>
                  <a
                    href={
                      profile.leetcodeProof?.htmlUrl ?? profile.leetcodeUrl ?? "#"
                    }
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
              </Card>
            ) : null}

            {socials.length > 0 || profile.videoResumeUrl ? (
              <Card title="Social">
                <div className="flex flex-wrap gap-2">
                  {socials.map((link) => (
                    <a
                      key={`${link.platform}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-stone-800 text-white hover:bg-zinc-950"
                    >
                      <SocialPlatformMark platform={link.platform} className="h-4 w-4" />
                      <span className="sr-only">{link.platform}</span>
                    </a>
                  ))}
                </div>
              </Card>
            ) : null}

            {profile.projects.length > 0 ? (
              <Card title="Projects">
                <ul className="space-y-3">
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
              </Card>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-zinc-900">At a glance</h3>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-relaxed text-stone-600">
              {current ? (
                <li>
                  {current.isCurrent ? "Currently " : ""}
                  {current.title} at{" "}
                  <span className="font-semibold text-zinc-900">{current.company}</span>
                </li>
              ) : role ? (
                <li>
                  {personKind === "interviewer" ? "Interviews as " : ""}
                  <span className="font-semibold text-zinc-900">{role}</span>
                </li>
              ) : (
                <li>Profile details are still being filled in.</li>
              )}
              {roleCount > 0 ? (
                <li>
                  <span className="font-semibold text-zinc-900">{roleCount} roles</span>{" "}
                  across their career so far.
                </li>
              ) : null}
              {profile.experienceYears != null ? (
                <li>{profile.experienceYears} years of experience.</li>
              ) : null}
              {profile.location ? <li>Based in {profile.location}.</li> : null}
            </ul>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm leading-relaxed text-stone-600">
              Share this profile. Know someone who should meet {firstName}? Send
              them this page.
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <Link2 className="h-4 w-4" />
              {copied ? "Link copied" : "Copy profile link"}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
