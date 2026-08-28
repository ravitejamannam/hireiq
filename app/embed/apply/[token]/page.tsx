import { unstable_noStore as noStore } from "next/cache";

import HostedApplyForm from "@/components/apply/HostedApplyForm";
import { resolvePublicHostedApply } from "@/lib/apply/hosted-apply-service";
import { HostedApplyError } from "@/lib/apply/hosted-apply-errors";

export const dynamic = "force-dynamic";

/**
 * T128 Embeddable apply widget (the "open throne" steal).
 *
 * A chrome-free, iframe-friendly apply page. Partners paste a single
 * <iframe> snippet into their careers site; the form posts to the same
 * hardened /api/apply/[token] endpoint as the full page.
 */

type EmbedPageProps = {
  params: Promise<{ token: string }>;
};

function EmbedMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{body}</p>
      </div>
    </main>
  );
}

export default async function EmbedApplyPage({ params }: EmbedPageProps) {
  noStore();
  const { token } = await params;

  let page: Awaited<ReturnType<typeof resolvePublicHostedApply>> | null = null;
  let applyError: HostedApplyError | null = null;
  try {
    page = await resolvePublicHostedApply(token);
  } catch (error) {
    if (!(error instanceof HostedApplyError)) throw error;
    applyError = error;
  }

  if (applyError || !page) {
    return (
      <EmbedMessage
        title={
          applyError?.code === "CLOSED"
            ? "No longer accepting applications"
            : "Application unavailable"
        }
        body={applyError?.message ?? "This application link is unavailable or has expired."}
      />
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-4 py-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          {page.companyDisplayName ?? "Company"}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-900">
          Apply — {page.title}
        </h1>
        {page.location ? (
          <p className="mt-1 text-sm text-zinc-500">{page.location}</p>
        ) : null}

        <div className="mt-6">
            <HostedApplyForm token={token} compact />
        </div>

        <p className="mt-6 text-center text-[10px] text-zinc-400">
          Powered by HireIQ
        </p>
      </div>
    </main>
  );
}
