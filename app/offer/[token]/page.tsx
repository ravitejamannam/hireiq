import { unstable_noStore as noStore } from "next/cache";

import OfferDecisionButtons from "@/components/offers/OfferDecisionButtons";
import { findApplicationByOfferToken } from "@/lib/offers/offer-acceptance";

export const dynamic = "force-dynamic";

/**
 * T133: public offer acceptance page. Token is verified by hash lookup;
 * nothing about the application is exposed beyond role/company/name/terms.
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

function formatDate(value: Date | null | undefined) {
  if (!value) return null;
  return value.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function OfferAcceptPage({ params }: OfferPageProps) {
  noStore();
  const { token } = await params;
  const application = await findApplicationByOfferToken(token);

  if (!application) {
    return (
      <Message
        title="Offer link not found"
        body="This link may have been revoked. Contact the hiring team."
      />
    );
  }

  const alreadyAccepted = Boolean(application.offerAcceptedAt);
  const alreadyDeclined = Boolean(application.offerDeclinedAt);

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
          {application.offerCompensation ? (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Compensation</dt>
              <dd className="font-medium text-zinc-900">
                {application.offerCompensation}
              </dd>
            </div>
          ) : null}
          {application.proposedStartDate ? (
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Start date</dt>
              <dd className="font-medium text-zinc-900">
                {formatDate(application.proposedStartDate)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Status</dt>
            <dd
              className={`font-medium ${
                alreadyAccepted
                  ? "text-emerald-700"
                  : alreadyDeclined
                    ? "text-zinc-600"
                    : "text-amber-600"
              }`}
            >
              {alreadyAccepted
                ? "✓ Accepted"
                : alreadyDeclined
                  ? "Declined"
                  : "Awaiting decision"}
            </dd>
          </div>
        </dl>

        {application.offerTerms ? (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
            {application.offerTerms}
          </p>
        ) : null}

        <div className="mt-6">
          {alreadyAccepted ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                ✓ This offer was accepted on{" "}
                {formatDate(application.offerAcceptedAt)}.
              </div>
              <a
                href={`/api/offer/${encodeURIComponent(token)}/letter`}
                className="inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
              >
                Open joining letter
              </a>
            </div>
          ) : alreadyDeclined ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-medium text-zinc-700">
              This offer was declined on {formatDate(application.offerDeclinedAt)}.
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm leading-relaxed text-zinc-600">
                By accepting, you confirm your intention to join{" "}
                <strong>{application.job.company.name}</strong> as{" "}
                <strong>{application.job.title}</strong>, subject to standard
                onboarding and background verification.
              </p>
              <OfferDecisionButtons token={token} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
