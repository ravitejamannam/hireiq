/**
 * Public social / proof-of-work platforms a candidate can link at apply.
 * URLs only — no OAuth. Hiring-team widgets fetch public data later.
 * LinkedIn has no public profile API; we store the URL and show the handle.
 */

export const SOCIAL_PLATFORMS = [
  { id: "GITHUB", label: "GitHub", placeholder: "github.com/you", host: "github.com" },
  { id: "LINKEDIN", label: "LinkedIn", placeholder: "linkedin.com/in/you", host: "linkedin.com" },
  { id: "TWITTER", label: "Twitter / X", placeholder: "x.com/you", host: "x.com" },
  { id: "STACKOVERFLOW", label: "Stack Overflow", placeholder: "stackoverflow.com/users/…", host: "stackoverflow.com" },
  { id: "CODEPEN", label: "CodePen", placeholder: "codepen.io/you", host: "codepen.io" },
  { id: "DRIBBBLE", label: "Dribbble", placeholder: "dribbble.com/you", host: "dribbble.com" },
  { id: "BEHANCE", label: "Behance", placeholder: "behance.net/you", host: "behance.net" },
  { id: "MEDIUM", label: "Medium", placeholder: "medium.com/@you", host: "medium.com" },
  { id: "DEVIANTART", label: "DeviantArt", placeholder: "deviantart.com/you", host: "deviantart.com" },
  { id: "FIGMA", label: "Figma", placeholder: "figma.com/@you", host: "figma.com" },
  { id: "GITLAB", label: "GitLab", placeholder: "gitlab.com/you", host: "gitlab.com" },
  { id: "PINTEREST", label: "Pinterest", placeholder: "pinterest.com/you", host: "pinterest.com" },
  { id: "PRODUCTHUNT", label: "Product Hunt", placeholder: "producthunt.com/@you", host: "producthunt.com" },
  { id: "UNSPLASH", label: "Unsplash", placeholder: "unsplash.com/@you", host: "unsplash.com" },
  { id: "YOUTUBE", label: "YouTube", placeholder: "youtube.com/@you", host: "youtube.com" },
  { id: "INSTAGRAM", label: "Instagram", placeholder: "instagram.com/you", host: "instagram.com" },
  { id: "PORTFOLIO", label: "Portfolio", placeholder: "https://your.site", host: null },
  { id: "LEETCODE", label: "LeetCode", placeholder: "leetcode.com/u/you", host: "leetcode.com" },
  { id: "DEVTO", label: "DEV", placeholder: "dev.to/you", host: "dev.to" },
  { id: "KAGGLE", label: "Kaggle", placeholder: "kaggle.com/you", host: "kaggle.com" },
  { id: "SUBSTACK", label: "Substack", placeholder: "you.substack.com", host: "substack.com" },
  { id: "CODEFORCES", label: "Codeforces", placeholder: "codeforces.com/profile/you", host: "codeforces.com" },
  { id: "OTHER", label: "Other", placeholder: "https://", host: null },
] as const;

export type SocialPlatformId = (typeof SOCIAL_PLATFORMS)[number]["id"];

export type ProfileSocialLink = {
  platform: SocialPlatformId;
  url: string;
};

export const INTEGRATION_PROVIDERS = [
  {
    id: "GITHUB" as const,
    label: "GitHub",
    description: "Showcase your repositories and contribution graph.",
    placeholder: "github-username",
  },
  {
    id: "LEETCODE" as const,
    label: "LeetCode",
    description: "Display your problem-solving stats and progress.",
    placeholder: "leetcode-username",
  },
  {
    id: "DRIBBBLE" as const,
    label: "Dribbble",
    description: "Show your design shots and creative work.",
    placeholder: "dribbble-username",
  },
  {
    id: "SUBSTACK" as const,
    label: "Substack",
    description: "Feature your newsletter posts and writing.",
    placeholder: "your-publication",
  },
  {
    id: "DEVTO" as const,
    label: "DEV",
    description: "Surface your dev.to articles and posts.",
    placeholder: "dev-username",
  },
  {
    id: "YOUTUBE" as const,
    label: "YouTube",
    description: "Feature your videos and channel highlights.",
    placeholder: "@channel",
  },
  {
    id: "CODEFORCES" as const,
    label: "Codeforces",
    description: "Share your competitive-programming rating and activity.",
    placeholder: "codeforces-handle",
  },
] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDERS)[number]["id"];

const PLATFORM_SET = new Set<string>(SOCIAL_PLATFORMS.map((item) => item.id));

const HOST_ALIASES: Array<{ host: string; id: SocialPlatformId }> = [
  { host: "github.com", id: "GITHUB" },
  { host: "linkedin.com", id: "LINKEDIN" },
  { host: "x.com", id: "TWITTER" },
  { host: "twitter.com", id: "TWITTER" },
  { host: "stackoverflow.com", id: "STACKOVERFLOW" },
  { host: "codepen.io", id: "CODEPEN" },
  { host: "dribbble.com", id: "DRIBBBLE" },
  { host: "behance.net", id: "BEHANCE" },
  { host: "medium.com", id: "MEDIUM" },
  { host: "deviantart.com", id: "DEVIANTART" },
  { host: "figma.com", id: "FIGMA" },
  { host: "gitlab.com", id: "GITLAB" },
  { host: "pinterest.com", id: "PINTEREST" },
  { host: "producthunt.com", id: "PRODUCTHUNT" },
  { host: "unsplash.com", id: "UNSPLASH" },
  { host: "youtube.com", id: "YOUTUBE" },
  { host: "youtu.be", id: "YOUTUBE" },
  { host: "instagram.com", id: "INSTAGRAM" },
  { host: "leetcode.com", id: "LEETCODE" },
  { host: "dev.to", id: "DEVTO" },
  { host: "kaggle.com", id: "KAGGLE" },
  { host: "substack.com", id: "SUBSTACK" },
  { host: "codeforces.com", id: "CODEFORCES" },
];

export function isSocialPlatformId(value: string): value is SocialPlatformId {
  return PLATFORM_SET.has(value);
}

export function socialPlatformLabel(id: SocialPlatformId) {
  return SOCIAL_PLATFORMS.find((item) => item.id === id)?.label ?? id;
}

export function socialPlatformMeta(id: SocialPlatformId) {
  return SOCIAL_PLATFORMS.find((item) => item.id === id);
}

function firstPathSegment(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

export function githubHandleFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
    const handle = firstPathSegment(parsed.pathname);
    if (!handle || handle.length > 39) return null;
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle)) {
      return null;
    }
    return handle;
  } catch {
    return null;
  }
}

export function leetcodeHandleFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)leetcode\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const handle = parts[0] === "u" ? parts[1] : parts[0];
    if (!handle || handle.length > 40) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(handle)) return null;
    return handle;
  } catch {
    return null;
  }
}

export function linkedInHandleFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "in" && parts[0] !== "pub") return parts[0] || null;
    const handle = parts[1];
    if (!handle || handle.length > 80) return null;
    return decodeURIComponent(handle.replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

export function urlFromGithubHandle(handle: string) {
  return `https://github.com/${handle.trim()}`;
}

export function urlFromLeetcodeHandle(handle: string) {
  return `https://leetcode.com/${handle.trim()}`;
}

export function urlFromIntegrationHandle(
  id: IntegrationProviderId,
  raw: string,
): string {
  const handle = raw.trim().replace(/^@/, "");
  switch (id) {
    case "GITHUB":
      return urlFromGithubHandle(handle);
    case "LEETCODE":
      return urlFromLeetcodeHandle(handle);
    case "DRIBBBLE":
      return `https://dribbble.com/${handle}`;
    case "SUBSTACK":
      if (handle.includes(".")) return `https://${handle.replace(/^https?:\/\//, "")}`;
      return `https://${handle}.substack.com`;
    case "DEVTO":
      return `https://dev.to/${handle}`;
    case "YOUTUBE":
      return handle.startsWith("@")
        ? `https://youtube.com/${handle}`
        : `https://youtube.com/@${handle}`;
    case "CODEFORCES":
      return `https://codeforces.com/profile/${handle}`;
  }
}

export function integrationHandleFromUrl(
  id: IntegrationProviderId,
  url: string | null | undefined,
): string {
  if (!url?.trim()) return "";
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    switch (id) {
      case "GITHUB":
        return githubHandleFromUrl(url) ?? "";
      case "LEETCODE":
        return leetcodeHandleFromUrl(url) ?? "";
      case "DRIBBBLE":
      case "DEVTO":
        return parts[0] ?? "";
      case "YOUTUBE": {
        const first = parts[0] ?? "";
        return first.replace(/^@/, "");
      }
      case "CODEFORCES":
        return parts[0] === "profile" ? (parts[1] ?? "") : (parts[0] ?? "");
      case "SUBSTACK": {
        const host = parsed.hostname.replace(/^www\./, "");
        if (host.endsWith(".substack.com")) return host.replace(/\.substack\.com$/, "");
        return host;
      }
    }
  } catch {
    return "";
  }
}

export function detectPlatformFromUrl(raw: string): SocialPlatformId | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const alias = HOST_ALIASES.find(
      (item) => host === item.host || host.endsWith(`.${item.host}`),
    );
    return alias?.id ?? "PORTFOLIO";
  } catch {
    return null;
  }
}

export function normalizeProfileUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseBulkSocialLinks(raw: string): ProfileSocialLink[] {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const links: ProfileSocialLink[] = [];
  for (const token of tokens) {
    const url = normalizeProfileUrl(token);
    if (!url) continue;
    const platform = detectPlatformFromUrl(url) ?? "OTHER";
    const key = `${platform}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ platform, url });
  }
  return links;
}

export function canonicalSocialsFromLinks(links: ProfileSocialLink[]): {
  githubUrl: string | null;
  linkedInUrl: string | null;
  twitterUrl: string | null;
  portfolioUrl: string | null;
  leetcodeUrl: string | null;
  extra: ProfileSocialLink[];
} {
  let githubUrl: string | null = null;
  let linkedInUrl: string | null = null;
  let twitterUrl: string | null = null;
  let portfolioUrl: string | null = null;
  let leetcodeUrl: string | null = null;
  const extra: ProfileSocialLink[] = [];

  for (const link of links) {
    switch (link.platform) {
      case "GITHUB":
        githubUrl = link.url || githubUrl;
        break;
      case "LINKEDIN":
        linkedInUrl = link.url || linkedInUrl;
        break;
      case "TWITTER":
        twitterUrl = link.url || twitterUrl;
        break;
      case "PORTFOLIO":
        portfolioUrl = link.url || portfolioUrl;
        break;
      case "LEETCODE":
        leetcodeUrl = link.url || leetcodeUrl;
        break;
      default:
        extra.push(link);
    }
  }

  return {
    githubUrl,
    linkedInUrl,
    twitterUrl,
    portfolioUrl,
    leetcodeUrl,
    extra,
  };
}

export function socialLinksFromCanonical(input: {
  githubUrl: string | null;
  linkedInUrl: string | null;
  twitterUrl: string | null;
  portfolioUrl: string | null;
  leetcodeUrl?: string | null;
  extra?: ProfileSocialLink[];
}): ProfileSocialLink[] {
  const links: ProfileSocialLink[] = [];
  if (input.linkedInUrl) {
    links.push({ platform: "LINKEDIN", url: input.linkedInUrl });
  }
  if (input.githubUrl) {
    links.push({ platform: "GITHUB", url: input.githubUrl });
  }
  if (input.twitterUrl) {
    links.push({ platform: "TWITTER", url: input.twitterUrl });
  }
  if (input.portfolioUrl) {
    links.push({ platform: "PORTFOLIO", url: input.portfolioUrl });
  }
  if (input.leetcodeUrl) {
    links.push({ platform: "LEETCODE", url: input.leetcodeUrl });
  }
  for (const extra of input.extra ?? []) {
    if (
      extra.platform === "GITHUB" ||
      extra.platform === "LINKEDIN" ||
      extra.platform === "TWITTER" ||
      extra.platform === "PORTFOLIO" ||
      extra.platform === "LEETCODE"
    ) {
      continue;
    }
    links.push(extra);
  }
  return links;
}

type SocialDraftSlice = {
  githubUrl: string;
  linkedInUrl: string;
  twitterUrl: string;
  portfolioUrl: string;
  leetcodeUrl: string;
  socialLinks: ProfileSocialLink[];
};

/** Include in-progress rows that still have an empty URL so the editor does not drop them. */
export function listSocialRows(draft: SocialDraftSlice): ProfileSocialLink[] {
  const filled = socialLinksFromCanonical({
    githubUrl: draft.githubUrl || null,
    linkedInUrl: draft.linkedInUrl || null,
    twitterUrl: draft.twitterUrl || null,
    portfolioUrl: draft.portfolioUrl || null,
    leetcodeUrl: draft.leetcodeUrl || null,
    extra: draft.socialLinks.filter((link) => link.url.trim()),
  });
  const pending = draft.socialLinks.filter((link) => !link.url.trim());
  return [...filled, ...pending];
}

export function applySocialRows(rows: ProfileSocialLink[]): SocialDraftSlice {
  const filled = rows.filter((link) => link.url.trim());
  const pending = rows.filter((link) => !link.url.trim());
  const split = canonicalSocialsFromLinks(filled);
  return {
    githubUrl: split.githubUrl ?? "",
    linkedInUrl: split.linkedInUrl ?? "",
    twitterUrl: split.twitterUrl ?? "",
    portfolioUrl: split.portfolioUrl ?? "",
    leetcodeUrl: split.leetcodeUrl ?? "",
    socialLinks: [...split.extra, ...pending],
  };
}

export function extraUrlForPlatform(
  extra: ProfileSocialLink[],
  id: SocialPlatformId,
): string {
  return extra.find((link) => link.platform === id)?.url ?? "";
}

export function upsertExtraSocial(
  extra: ProfileSocialLink[],
  platform: SocialPlatformId,
  url: string,
): ProfileSocialLink[] {
  const without = extra.filter((link) => link.platform !== platform);
  if (!url.trim()) return without;
  return [...without, { platform, url }];
}
