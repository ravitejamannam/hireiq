export function capturePublicProfile(input: {
  companyId: number;
  actorCompanyId: number;
  userId: number;
  profileUrl: string;
  name: string;
  headline?: string;
  extraProfiles?: unknown;
}) {
  if (input.companyId !== input.actorCompanyId) return { ok: false as const, error: "Not found." };
  if (input.extraProfiles != null) return { ok: false as const, error: "Capture one profile at a time." };
  let url: URL;
  try {
    url = new URL(input.profileUrl);
  } catch {
    return { ok: false as const, error: "Enter the profile you are viewing." };
  }
  if (url.protocol !== "https:") return { ok: false as const, error: "Only a public https profile can be captured." };
  return {
    ok: true as const,
    draft: {
      companyId: input.companyId,
      userId: input.userId,
      profileUrl: url.toString(),
      name: input.name.trim().slice(0, 120),
      headline: (input.headline ?? "").trim().slice(0, 240),
    },
    audit: {
      companyId: input.companyId,
      action: "PROFILE_CAPTURED",
      targetType: "ProfileCapture",
      targetId: input.userId,
      reason: "User-initiated capture of one public profile.",
    },
  };
}
