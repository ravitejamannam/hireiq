import { githubHandleFromUrl, urlFromGithubHandle } from "@/lib/profiles/social-platforms";

export type GithubRepoCard = {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  htmlUrl: string;
};

export type GithubProofSnapshot = {
  login: string;
  htmlUrl: string;
  name: string | null;
  avatarUrl: string | null;
  publicRepos: number;
  totalContributions: number | null;
  bio: string | null;
  repos: GithubRepoCard[];
  weeks: Array<{ date: string; count: number }>;
};

const cache = new Map<string, { at: number; value: GithubProofSnapshot | null }>();
const TTL_MS = 15 * 60 * 1000;

function githubHeaders(json = true) {
  const headers: Record<string, string> = {
    "User-Agent": "HireIQ-proof-of-work",
  };
  if (json) {
    headers.Accept = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
  }
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubGet<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: githubHeaders(), signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function lastDays(days: number) {
  const out: Array<{ date: string; count: number }> = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    out.push({ date: day.toISOString().slice(0, 10), count: 0 });
  }
  return out;
}

function padCalendar(days: Array<{ date: string; count: number }>) {
  if (days.length === 0) return lastDays(371);
  const first = new Date(`${days[0].date}T00:00:00Z`);
  if (Number.isNaN(first.getTime())) return days;
  const weekday = first.getUTCDay();
  return [
    ...Array.from({ length: weekday }, (_, index) => ({
      date: `pad-${index}`,
      count: 0,
    })),
    ...days,
  ];
}

const CALENDAR_QUERY = `
query ($login: String!) {
  user(login: $login) {
    login
    url
    name
    avatarUrl
    bio
    repositories { totalCount }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount }
        }
      }
    }
  }
}
`;

async function fetchCalendarGraphql(
  handle: string,
  signal: AbortSignal,
): Promise<{
  weeks: Array<{ date: string; count: number }>;
  total: number;
} | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;
  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        ...githubHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: CALENDAR_QUERY, variables: { login: handle } }),
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            contributionCalendar?: {
              totalContributions: number;
              weeks: Array<{
                contributionDays: Array<{ date: string; contributionCount: number }>;
              }>;
            };
          };
        } | null;
      };
    };
    const calendar = body.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) return null;
    const weeks = calendar.weeks.flatMap((week) =>
      week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
      })),
    );
    return { weeks, total: calendar.totalContributions };
  } catch {
    return null;
  }
}

async function fetchCalendarHtml(
  handle: string,
  signal: AbortSignal,
): Promise<{
  weeks: Array<{ date: string; count: number }>;
  total: number | null;
} | null> {
  try {
    const response = await fetch(
      `https://github.com/users/${encodeURIComponent(handle)}/contributions`,
      {
        headers: {
          "User-Agent": "HireIQ-proof-of-work",
          Accept: "text/html",
        },
        signal,
      },
    );
    if (!response.ok) return null;
    const html = await response.text();
    const days: Array<{ date: string; count: number }> = [];
    const rect = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d+)"/g;
    const rectAlt = /data-level="(\d+)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"/g;
    let match: RegExpExecArray | null;
    while ((match = rect.exec(html))) {
      days.push({ date: match[1], count: Number(match[2]) });
    }
    if (days.length === 0) {
      while ((match = rectAlt.exec(html))) {
        days.push({ date: match[2], count: Number(match[1]) });
      }
    }
    if (days.length === 0) return null;
    const totalMatch = html.match(/([0-9,]+)\s+contributions/i);
    const total = totalMatch
      ? Number(totalMatch[1].replaceAll(",", ""))
      : days.reduce((sum, day) => sum + day.count, 0);
    return { weeks: days, total: Number.isFinite(total) ? total : null };
  } catch {
    return null;
  }
}

export async function fetchGithubProof(
  githubUrl: string | null | undefined,
): Promise<GithubProofSnapshot | null> {
  const handle = githubHandleFromUrl(githubUrl ?? null);
  if (!handle) return null;

  const cached = cache.get(handle.toLowerCase());
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const [user, repos, events, calendar] = await Promise.all([
      githubGet<{
        login: string;
        html_url: string;
        name: string | null;
        avatar_url: string | null;
        public_repos: number;
        bio: string | null;
      }>(`https://api.github.com/users/${encodeURIComponent(handle)}`, controller.signal),
      githubGet<
        Array<{
          name: string;
          full_name: string;
          description: string | null;
          language: string | null;
          stargazers_count: number;
          forks_count: number;
          html_url: string;
          fork: boolean;
        }>
      >(
        `https://api.github.com/users/${encodeURIComponent(handle)}/repos?sort=updated&per_page=30`,
        controller.signal,
      ),
      githubGet<Array<{ type: string; created_at: string }>>(
        `https://api.github.com/users/${encodeURIComponent(handle)}/events/public?per_page=100`,
        controller.signal,
      ),
      fetchCalendarGraphql(handle, controller.signal).then(
        (value) => value ?? fetchCalendarHtml(handle, controller.signal),
      ),
    ]);

    if (!user?.login) {
      cache.set(handle.toLowerCase(), { at: Date.now(), value: null });
      return null;
    }

    let weeks = calendar?.weeks ?? [];
    let totalContributions = calendar?.total ?? null;
    if (weeks.length === 0) {
      weeks = lastDays(371);
      const byDate = new Map(weeks.map((day) => [day.date, day]));
      for (const event of events ?? []) {
        const date = event.created_at?.slice(0, 10);
        const bucket = date ? byDate.get(date) : null;
        if (bucket) bucket.count += 1;
      }
      totalContributions = weeks.reduce((sum, day) => sum + day.count, 0);
    }

    const snapshot: GithubProofSnapshot = {
      login: user.login,
      htmlUrl: user.html_url || urlFromGithubHandle(user.login),
      name: user.name,
      avatarUrl: user.avatar_url,
      publicRepos: user.public_repos ?? 0,
      totalContributions,
      bio: user.bio,
      repos: (repos ?? [])
        .filter((repo) => !repo.fork)
        .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
        .slice(0, 10)
        .map((repo) => ({
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          language: repo.language,
          stars: repo.stargazers_count ?? 0,
          forks: repo.forks_count ?? 0,
          htmlUrl: repo.html_url,
        })),
      weeks: padCalendar(weeks),
    };
    cache.set(handle.toLowerCase(), { at: Date.now(), value: snapshot });
    return snapshot;
  } finally {
    clearTimeout(timer);
  }
}
