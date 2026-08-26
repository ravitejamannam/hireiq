import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";

import HostedApplyForm from "@/components/apply/HostedApplyForm";
import { HostedApplyError } from "@/lib/apply/hosted-apply-errors";
import type { PublicHostedApplyPage } from "@/lib/apply/public-page";
import { resolvePublicHostedApply } from "@/lib/apply/hosted-apply-service";
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-zinc-800">{value}</dd>
    </div>
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

  return (
    <main className="min-h-screen bg-[#F7F4EE]">
      {/* Role hero */}
      <header className="border-b border-stone-200/70 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            {page.companyDisplayName ?? "Company"}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-zinc-900">
            {page.title}
          </h1>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {page.location ? (
              <Fact label="Location" value={page.location} />
            ) : null}
            {page.experienceRange ? (
              <Fact label="Experience" value={page.experienceRange} />
            ) : null}
            {page.compensationRange ? (
              <Fact label="Compensation" value={page.compensationRange} />
            ) : null}
            {page.numberOfPositions ? (
              <Fact
                label="Openings"
                value={`${page.numberOfPositions} ${page.numberOfPositions === 1 ? "role" : "roles"}`}
              />
            ) : null}
          </div>

          {page.primarySkills ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {page.primarySkills.split(",").map((skill) => (
                <span
                  key={skill.trim()}
                  className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/10"
                >
                  {skill.trim()}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Role story */}
        {page.jobDescription ? (
          <section aria-labelledby="about-role">
            <h2 id="about-role" className="text-lg font-bold text-zinc-900">
              About the role
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-700">
              {page.jobDescription}
            </p>
          </section>
        ) : null}

        {page.mustHaveRequirements ? (
          <section className="mt-8" aria-labelledby="must-have">
            <h2 id="must-have" className="text-lg font-bold text-zinc-900">
              What we&apos;re looking for
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-700">
              {page.mustHaveRequirements}
            </p>
          </section>
        ) : null}

        {page.niceToHaveRequirements ? (
          <section className="mt-8" aria-labelledby="nice-to-have">
            <h2 id="nice-to-have" className="text-lg font-bold text-zinc-900">
              Nice to have
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-700">
              {page.niceToHaveRequirements}
            </p>
          </section>
        ) : null}

        {/* Apply card */}
        <section
          aria-labelledby="apply-now"
          className="mt-10 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
        >
          <h2 id="apply-now" className="text-xl font-bold text-zinc-900">
            Apply now
          </h2>
          <p className="mt-1.5 text-sm text-zinc-500">
            No account needed — about 2 minutes. After applying you&apos;ll
            take a short role assessment and can see where you stand on the
            public leaderboard.
          </p>
          <div className="mt-6">
            <HostedApplyForm token={token} />
          </div>
        </section>

        <footer className="py-10 text-center">
          <LinkLeaderboard token={token} />
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
