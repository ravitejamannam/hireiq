import { requireAdmin } from "@/lib/auth/authorization";
import { translate } from "@/lib/i18n/catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const admin = await requireAdmin();
  const { lang } = await searchParams;
  const locale = lang === "hi" ? "hi" : "en";
  const sequences = await prisma.outreachSequence.findMany({
    where: admin.companyId == null || admin.platformOperator ? {} : { companyId: admin.companyId },
    include: { steps: { orderBy: { position: "asc" } }, enrollments: { select: { id: true, status: true } } },
    orderBy: { id: "desc" },
    take: 20,
  });
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{translate(locale, "outreachTitle").text}</h1>
      <p className="mt-2 text-sm text-zinc-600">{translate(locale, "outreachIntro").text}</p>
      {sequences.length === 0 ? (
        <section className="mt-6 rounded-xl border border-zinc-200 p-4">
          <h2 className="font-semibold">No sequences yet</h2>
          <p className="mt-2 text-sm">A drafted email stays unsent until a recruiter approves that step. A reply or an unsubscribe pauses the sequence.</p>
          <button type="button" disabled className="mt-4 rounded bg-zinc-200 px-3 py-2 text-sm text-zinc-500">Send</button>
          <p className="mt-2 text-xs text-zinc-500">Send stays off until this email is approved.</p>
        </section>
      ) : sequences.map((sequence) => (
        <section key={sequence.id} className="mt-6 rounded-xl border border-zinc-200 p-4">
          <h2 className="font-semibold">{sequence.name}</h2>
          <ul className="mt-3 space-y-3">
            {sequence.steps.map((step) => (
              <li key={step.id} className="rounded border border-zinc-100 p-3">
                <p className="text-sm font-semibold">{step.subject}</p>
                <p className="mt-1 text-sm text-zinc-700">{step.body}</p>
                {step.approvedAt ? (
                  <p className="mt-2 text-sm text-green-800">Approved. This step can be sent.</p>
                ) : (
                  <form className="mt-2" method="post" action={`/dashboard/outreach/${sequence.id}/approve`}>
                    <input type="hidden" name="stepId" value={step.id} />
                    <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">Approve</button>
                    <button type="button" disabled className="ml-2 rounded bg-zinc-200 px-3 py-2 text-sm text-zinc-500">Send</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
