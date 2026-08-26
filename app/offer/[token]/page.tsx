import { unstable_noStore as noStore } from "next/cache";

import OfferAcceptButton from "@/components/offers/OfferAcceptButton";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * T133: public offer acceptance page. Token is verified by hash lookup;
 * nothing about the application is exposed beyond role/company/name.
 */

type OfferPageProps = {
  params: Promise<{ token: string }>;
};

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{body}</p>
      </div>
    </main>
  );
}

export default async function OfferAcceptPage({ params }: OfferPageProps) {
  noStore();
  const { token } = await params;

  if (!/^offer_[a-f0-9]{48}$/.test(token)) {
    return (
      <Message
        title="Invalid offer link"
        body="This link doesn't look right. Please ask the hiring team for a fresh link."
      />
    );
  }

  const { createHash } = await import("crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const application = await prisma.application.findUnique({
    where: { offerAcceptanceTokenHash: tokenHash },
    select: {
      offerAcceptedAt: true,
      candidate: { select: { name: true } },
      job: {
        select: {
          title: true,
          location: true,
          company: { select: { name: true } },
        },
      },
    },
  });

  if (!application) {
    return (
      <Message
        title="Offer link not found"
        body="This link may have been revoked. Contact the hiring team."
      />
    );
  }

  const alreadyAccepted = Boolean(application.offerAcceptedAt);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          {application.job.company.name}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-900">
          Offer for {application.candidate.name}
        </h1>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Position</dt>
            <dd className="font-medium text-zinc-900">{application.job.title}</dd>
          </div>
          {application.job.location ? (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Location</dt>
              <dd className="font-medium text-zinc-900">{application.job.location}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Status</dt>
            <dd className={`font-medium ${alreadyAccepted ? "text-emerald-700" : "text-amber-600"}`}>
              {alreadyAccepted ? "✓ Accepted" : "Awaiting acceptance"}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          {alreadyAccepted ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              ✓ This offer was accepted on{" "}
              {application.offerAcceptedAt?.toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              .
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm leading-relaxed text-zinc-600">
                By accepting, you confirm your intention to join{" "}
                <strong>{application.job.company.name}</strong> as{" "}
                <strong>{application.job.title}</strong>, subject to standard
                onboarding and background verification.
              </p>
              <OfferAcceptButton token={token} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
