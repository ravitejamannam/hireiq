import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { AssessmentAttemptStatus } from "@prisma/client";

import AssessmentTakeForm from "@/components/assess/AssessmentTakeForm";
import {
  AssessmentError,
} from "@/lib/assessments/assessment-errors";
import { resolvePublicAssessment } from "@/lib/assessments/assessment-service";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Assessment",
  robots: { index: false, follow: false },
};

type AssessPageProps = {
  params: Promise<{ token: string }>;
};

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-start px-6 py-16">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-10">
        <h1 className="text-3xl font-bold text-black">{title}</h1>
        <p className="mt-3 text-zinc-600">{body}</p>
      </div>
    </main>
  );
}

export default async function PublicAssessmentPage({ params }: AssessPageProps) {
  noStore();
  const { token } = await params;

  try {
    await consumeAuthRateLimit({
      name: "assessmentGetIp",
      key: rateLimitKeyForIp(await readRequestIp()),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return (
        <Message
          title="Please try again later"
          body="Too many attempts. Try again later."
        />
      );
    }
    throw error;
  }

  try {
    const page = await resolvePublicAssessment(token);
    const alreadySubmitted =
      page.status === AssessmentAttemptStatus.COMPLETED;

    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
        <article className="rounded-2xl border border-zinc-200 bg-white p-10">
          <p className="text-sm text-zinc-500">{page.companyDisplayName}</p>
          <h1 className="mt-2 text-3xl font-bold text-black">{page.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            You have 48 hours from applying to complete this assessment.
          </p>
          <div className="mt-8">
            <AssessmentTakeForm
              token={token}
              expiresAt={page.expiresAt}
              questions={page.questions}
              alreadySubmitted={alreadySubmitted}
              score={page.score}
              maxScore={page.maxScore}
              leaderboardHref={`/assess/${encodeURIComponent(token)}/leaderboard`}
            />
          </div>
        </article>
      </main>
    );
  } catch (error) {
    if (error instanceof AssessmentError) {
      return (
        <Message
          title={
            error.code === "EXPIRED"
              ? "Assessment window closed"
              : "Assessment unavailable"
          }
          body={error.message}
        />
      );
    }
    throw error;
  }
}
