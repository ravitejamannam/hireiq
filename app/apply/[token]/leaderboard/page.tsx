import type { Metadata } from "next";

import CandidateLeaderboardNotice from "@/components/assess/CandidateLeaderboardNotice";

export const metadata: Metadata = {
  title: "Results",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ApplyLeaderboardPage({ params }: PageProps) {
  const { token } = await params;
  return <CandidateLeaderboardNotice backHref={`/apply/${encodeURIComponent(token)}`} />;
}
