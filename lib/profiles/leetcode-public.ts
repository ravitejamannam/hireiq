import {
  leetcodeHandleFromUrl,
  urlFromLeetcodeHandle,
} from "@/lib/profiles/social-platforms";

export type LeetcodeProofSnapshot = {
  username: string;
  htmlUrl: string;
  totalSolved: number;
  easy: number;
  medium: number;
  hard: number;
  ranking: number | null;
};

const cache = new Map<string, { at: number; value: LeetcodeProofSnapshot | null }>();
const TTL_MS = 15 * 60 * 1000;

const QUERY = `
query ($username: String!) {
  matchedUser(username: $username) {
    username
    profile { ranking }
    submitStats: submitStatsGlobal {
      acSubmissionNum { difficulty count }
    }
  }
}
`;

export async function fetchLeetcodeProof(
  leetcodeUrl: string | null | undefined,
): Promise<LeetcodeProofSnapshot | null> {
  const handle = leetcodeHandleFromUrl(leetcodeUrl ?? null);
  if (!handle) return null;

  const cached = cache.get(handle.toLowerCase());
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://leetcode.com",
        Referer: "https://leetcode.com",
        "User-Agent":
          "Mozilla/5.0 (compatible; HireIQ-proof-of-work; +https://hireiq.local)",
      },
      body: JSON.stringify({ query: QUERY, variables: { username: handle } }),
      signal: controller.signal,
    });
    if (!response.ok) {
      cache.set(handle.toLowerCase(), { at: Date.now(), value: null });
      return null;
    }
    const body = (await response.json()) as {
      data?: {
        matchedUser?: {
          username: string;
          profile?: { ranking?: number | null };
          submitStats?: {
            acSubmissionNum?: Array<{ difficulty: string; count: number }>;
          };
        } | null;
      };
    };
    const user = body.data?.matchedUser;
    if (!user?.username) {
      cache.set(handle.toLowerCase(), { at: Date.now(), value: null });
      return null;
    }
    const counts = new Map(
      (user.submitStats?.acSubmissionNum ?? []).map((row) => [
        row.difficulty.toLowerCase(),
        row.count,
      ]),
    );
    const snapshot: LeetcodeProofSnapshot = {
      username: user.username,
      htmlUrl: urlFromLeetcodeHandle(user.username),
      totalSolved: counts.get("all") ?? 0,
      easy: counts.get("easy") ?? 0,
      medium: counts.get("medium") ?? 0,
      hard: counts.get("hard") ?? 0,
      ranking: user.profile?.ranking ?? null,
    };
    cache.set(handle.toLowerCase(), { at: Date.now(), value: snapshot });
    return snapshot;
  } catch {
    cache.set(handle.toLowerCase(), { at: Date.now(), value: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
