export const PUBLIC_ASSESSMENT_LEADERBOARD_LIMIT = 100;
export const HIRING_ASSESSMENT_LEADERBOARD_LIMIT = 200;

const PUBLIC_FALLBACK = "Candidate";

/**
 * Public boards show first name + last initial. Never email, never an id.
 */
export function toPublicLeaderboardName(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.includes("@")) {
    return PUBLIC_FALLBACK;
  }

  const parts = trimmed.split(" ");
  const first = parts[0] ?? "";
  if (!first) {
    return PUBLIC_FALLBACK;
  }

  if (parts.length === 1) {
    return first;
  }

  const last = parts[parts.length - 1] ?? "";
  const initial = Array.from(last)[0] ?? "";
  if (!initial || !/[\p{L}]/u.test(initial)) {
    return first;
  }

  return `${first} ${initial.toUpperCase()}.`;
}

export function toHiringLeaderboardName(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  return trimmed || PUBLIC_FALLBACK;
}
