import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";

import HostedApplyForm from "@/components/apply/HostedApplyForm";
import JobPostingDetail from "@/components/jobs/JobPostingDetail";
import { HostedApplyError } from "@/lib/apply/hosted-apply-errors";
import type { PublicHostedApplyPage } from "@/lib/apply/public-page";
import { listKnockoutsForApplyToken } from "@/lib/apply/knockout-questions";
import { resolvePublicHostedApply } from "@/lib/apply/hosted-apply-service";
import { resolveJobPostingView } from "@/lib/jobs/job-posting-view";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  try {
    const page = await resolvePublicHostedApply(token);
    return {
      title: `Apply — ${page.title}`,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Apply", robots: { index: false, follow: false } };
  }
}

type ApplyPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function ApplyMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-xl">
          🗓️
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-3 leading-relaxed text-zinc-600">{body}</p>
      </div>
    </main>
  );
}

export default async function HostedApplyPage({ params }: ApplyPageProps) {
  noStore();
  const { token } = await params;

  let rateLimited = false;
  try {
    await consumeAuthRateLimit({
      name: "hostedApplyGetIp",
      key: rateLimitKeyForIp(await readRequestIp()),
    });
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    rateLimited = true;
  }

  if (rateLimited) {
    return (
      <ApplyMessage
        title="Please try again later"
        body="Too many attempts from this network. Try again in a little while."
      />
    );
  }

  let page: PublicHostedApplyPage | null = null;
  let applyError: HostedApplyError | null = null;
  try {
    page = await resolvePublicHostedApply(token);
  } catch (error) {
    if (!(error instanceof HostedApplyError)) throw error;
    applyError = error;
  }

  if (applyError || !page) {
    return (
      <ApplyMessage
        title={
          applyError?.code === "CLOSED"
            ? "No longer accepting applications"
            : "Application unavailable"
        }
        body={
          applyError?.message ??
          "This application link is unavailable or has expired."
        }
      />
    );
  }

  const knockouts = await listKnockoutsForApplyToken(token);

  return (
    <main className="min-h-screen bg-[#F7F4EE]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <JobPostingDetail
            view={resolveJobPostingView(
              {
                title: page.title,
                companyName: page.companyDisplayName ?? "Company",
                companyIndustry: page.companyIndustry,
                companyEmployees: page.companyEmployees,
                location: page.location,
                experienceRange: page.experienceRange,
                numberOfPositions: page.numberOfPositions,
                compensationRange: page.compensationRange,
                jobDescription: page.jobDescription,
                mustHaveRequirements: page.mustHaveRequirements,
                niceToHaveRequirements: page.niceToHaveRequirements,
                primarySkills: page.primarySkills,
                structuredPayload: page.posting,
              },
              "Open",
            )}
          />
        </div>

        {/* Apply card */}
        <section
          aria-labelledby="apply-now"
          className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="apply-now" className="text-xl font-bold text-zinc-900">
            Apply now
          </h2>
          <p className="mt-1.5 text-sm text-zinc-500">
            No account needed — about 2 minutes. After you apply you take this
            role&apos;s assessment. That score is not a hire decision.
          </p>
          <div className="mt-6">
            <HostedApplyForm
              token={token}
              expectsAssessment={page.roleCategory != null}
              knockouts={knockouts}
            />
          </div>
        </section>

        <footer className="py-10 text-center">
          <LinkLeaderboard token={token} />
          {page.companyPublicSlug ? (
            <p className="mt-3">
              <Link
                href={`/careers/${encodeURIComponent(page.companyPublicSlug)}`}
                className="text-sm font-semibold text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
              >
                More open roles at {page.companyDisplayName ?? "this company"} →
              </Link>
            </p>
          ) : null}
          <p className="mt-4 text-xs text-zinc-400">
            Applications are handled securely by HireIQ · Your data belongs to
            you
          </p>
        </footer>
      </div>
    </main>
  );
}

function LinkLeaderboard({ token }: { token: string }) {
  return (
    <a
      href={`/apply/${encodeURIComponent(token)}/leaderboard`}
      className="text-sm font-semibold text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
    >
      View this role&apos;s leaderboard →
    </a>
  );
}
