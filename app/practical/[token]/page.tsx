import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";

import PracticalSubmitForm from "@/components/assess/PracticalSubmitForm";
import { consumeAuthRateLimit, RateLimitError, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { loadPracticalForCandidate } from "@/lib/screening/practical-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Practical task",
  robots: { index: false, follow: false },
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

export default async function PracticalPage({ params }: { params: Promise<{ token: string }> }) {
  noStore();
  const { token } = await params;
  try {
    await consumeAuthRateLimit({ name: "assessmentGetIp", key: rateLimitKeyForIp(await readRequestIp()) });
  } catch (error) {
    if (error instanceof RateLimitError) return <Message title="Please try again later" body="Too many attempts. Try again later." />;
    throw error;
  }
  const practical = await loadPracticalForCandidate(token);
  if (!practical) return <Message title="Practical unavailable" body="This link is not valid. Use the most recent link the recruiter sent you." />;
  if (practical.closed) return <Message title="Practical closed" body="This application is no longer open, so no submission is needed." />;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <article className="rounded-2xl border border-zinc-200 bg-white p-8">
          <p className="text-sm text-zinc-500">{practical.companyName} · {practical.jobTitle}</p>
          <h1 className="mt-1 text-2xl font-bold text-black">{practical.title}</h1>
          <dl className="mt-6 space-y-4 text-sm text-zinc-700">
            {practical.instructions ? (
              <div>
                <dt className="font-semibold text-black">The task</dt>
                <dd className="mt-1 whitespace-pre-wrap">{practical.instructions}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold text-black">Time and deadline</dt>
              <dd className="mt-1">
                {practical.estimatedMinutes ? `Expected effort: about ${practical.estimatedMinutes} minutes. ` : ""}
                {practical.dueAt ? `Submit before ${new Date(practical.dueAt).toLocaleString()}.` : "No fixed deadline."}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-black">Allowed resources</dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {practical.allowedResources ?? "Documentation, search engines, and your usual tools are fine. The work must be your own; say where you used AI tools or external code."}
              </dd>
            </div>
            {practical.compensationNote ? (
              <div>
                <dt className="font-semibold text-black">Compensation</dt>
                <dd className="mt-1 whitespace-pre-wrap">{practical.compensationNote}</dd>
              </div>
            ) : null}
            {practical.rubric.length > 0 ? (
              <div>
                <dt className="font-semibold text-black">How it is evaluated</dt>
                <dd className="mt-1">
                  A person on the hiring team scores your work against these criteria. AI may suggest scores, but only a person&apos;s
                  scores count, and the result is one input to a human decision.
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {practical.rubric.map((criterion) => (
                      <li key={criterion.label}>
                        <span className="font-medium text-zinc-900">{criterion.label}</span> ({criterion.maxPoints} points)
                        {criterion.description ? `: ${criterion.description}` : ""}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold text-black">Privacy and support</dt>
              <dd className="mt-1">
                Only the hiring team for this role sees your submission. If you need an accommodation or more time, reply to the
                invitation email before the deadline.
              </dd>
            </div>
          </dl>
          <div className="mt-8">
            {practical.submittedAt ? (
              <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Submitted {new Date(practical.submittedAt).toLocaleString()}. The hiring team will review it and contact you about next steps.
              </p>
            ) : practical.accepting ? (
              <PracticalSubmitForm token={token} />
            ) : (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                The deadline has passed. If something prevented you from submitting, reply to the invitation email.
              </p>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
