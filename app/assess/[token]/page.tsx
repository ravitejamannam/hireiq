import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { AssessmentAttemptStatus } from "@prisma/client";

import AssessmentTakeForm from "@/components/assess/AssessmentTakeForm";
import GeneratedAssessmentForm from "@/components/assess/GeneratedAssessmentForm";
import { AssessmentError } from "@/lib/assessments/assessment-errors";
import { resolvePublicAssessment } from "@/lib/assessments/assessment-service";
import { loadCandidateAssessment } from "@/lib/assessments/generated-assessment-service";
import { consumeAuthRateLimit, RateLimitError, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Assessment",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

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

/**
 * One link format serves both assessment kinds: a job-specific assessment a
 * recruiter sent, or the role-bank assessment minted when the candidate applied.
 */
export default async function CandidateAssessmentPage({ params }: PageProps) {
  noStore();
  const { token } = await params;

  try {
    await consumeAuthRateLimit({ name: "assessmentGetIp", key: rateLimitKeyForIp(await readRequestIp()) });
  } catch (error) {
    if (error instanceof RateLimitError) return <Message title="Please try again later" body="Too many attempts. Try again later." />;
    throw error;
  }

  const generated = await loadCandidateAssessment(token);
  if (generated) {
    if (generated.closed) {
      return generated.reason === "submitted" ? (
        <Message title="Assessment submitted" body="Your answers were received. A recruiter reviews them with the rest of your application. You do not need to do anything else." />
      ) : (
        <Message title="Assessment link expired" body="This link has expired. If you could not take it because of a technical problem or an accommodation need, reply to the invitation email and the recruiter can send a new link." />
      );
    }
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <GeneratedAssessmentForm token={token} page={generated} />
        </div>
      </main>
    );
  }

  let page = null;
  let loadError: string | null = null;
  try {
    page = await resolvePublicAssessment(token);
  } catch (error) {
    if (error instanceof AssessmentError) loadError = error.message;
    else throw error;
  }
  if (loadError || !page) {
    return <Message title={loadError === "EXPIRED" ? "Assessment window closed" : "Assessment unavailable"} body={loadError ?? "Not found."} />;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <article className="rounded-2xl border border-zinc-200 bg-white p-10">
          <p className="text-sm text-zinc-500">{page.companyDisplayName}</p>
          <h1 className="mt-2 text-3xl font-bold text-black">{page.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Complete this before the window closes. It checks the basics for this role and is one input a recruiter
            reviews, not a hire decision. Use your own knowledge; no outside help unless the recruiter said otherwise.
          </p>
          <div className="mt-8">
            <AssessmentTakeForm
              token={token}
              expiresAt={page.expiresAt}
              questions={page.questions}
              alreadySubmitted={page.status === AssessmentAttemptStatus.COMPLETED}
              score={page.score}
              maxScore={page.maxScore}
            />
          </div>
        </article>
      </div>
    </main>
  );
}
