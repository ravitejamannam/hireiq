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

export const metadata: Metadata = {
  title: "Apply",
  robots: { index: false, follow: false },
};

type ApplyPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function ApplyMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-start px-6 py-16">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-10">
        <h1 className="text-3xl font-bold text-black">{title}</h1>
        <p className="mt-3 text-zinc-600">{body}</p>
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
    if (!(error instanceof RateLimitError)) {
      throw error;
    }
    rateLimited = true;
  }

  if (rateLimited) {
    return (
      <ApplyMessage
        title="Please try again later"
        body="Too many attempts. Try again later."
      />
    );
  }

  let page: PublicHostedApplyPage | null = null;
  let applyError: HostedApplyError | null = null;
  try {
    page = await resolvePublicHostedApply(token);
  } catch (error) {
    if (!(error instanceof HostedApplyError)) {
      throw error;
    }
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
        body={applyError?.message ?? "This application link is unavailable."}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <article className="rounded-2xl border border-zinc-200 bg-white p-10">
        <p className="text-sm text-zinc-500">
          {page.companyDisplayName ?? "Company"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">{page.title}</h1>
        <dl className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
          {page.roleCategory ? (
            <div>
              <dt className="font-medium text-black">Category</dt>
              <dd>{page.roleCategory}</dd>
            </div>
          ) : null}
          {page.experienceRange ? (
            <div>
              <dt className="font-medium text-black">Experience</dt>
              <dd>{page.experienceRange}</dd>
            </div>
          ) : null}
          {page.location ? (
            <div>
              <dt className="font-medium text-black">Location</dt>
              <dd>{page.location}</dd>
            </div>
          ) : null}
          {page.numberOfPositions ? (
            <div>
              <dt className="font-medium text-black">Openings</dt>
              <dd>{page.numberOfPositions}</dd>
            </div>
          ) : null}
          {page.compensationRange ? (
            <div>
              <dt className="font-medium text-black">Compensation</dt>
              <dd>{page.compensationRange}</dd>
            </div>
          ) : null}
        </dl>
        {page.jobDescription ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold text-black">About the role</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {page.jobDescription}
            </p>
          </section>
        ) : null}
        {page.mustHaveRequirements ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold text-black">Must have</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {page.mustHaveRequirements}
            </p>
          </section>
        ) : null}
        {page.niceToHaveRequirements ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold text-black">Nice to have</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {page.niceToHaveRequirements}
            </p>
          </section>
        ) : null}
        {page.primarySkills ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold text-black">Skills</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {page.primarySkills}
            </p>
          </section>
        ) : null}

        <section className="mt-10 border-t border-zinc-200 pt-8">
          <h2 className="text-lg font-semibold text-black">Apply</h2>
          <p className="mt-2 text-sm text-zinc-600">
            No HireIQ account is required. Resume upload is not available yet.
          </p>
          <div className="mt-6">
            <HostedApplyForm token={token} />
          </div>
        </section>
      </article>
    </main>
  );
}
