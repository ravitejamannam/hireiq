import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AssessmentAiPage() {
  const admin = await requireAdmin();
  const invites = await prisma.assessmentInvite.findMany({
    where: admin.companyId == null || admin.platformOperator ? {} : { application: { companyId: admin.companyId } },
    orderBy: { id: "desc" },
    take: 20,
    select: {
      id: true,
      aiUsePolicy: true,
      application: { select: { job: { select: { title: true } }, candidate: { select: { name: true } } } },
    },
  });
  const exchanges = await prisma.assessmentAiExchange.findMany({
    where: {
      inviteId: { in: invites.map((invite) => invite.id) },
      ...(admin.companyId == null || admin.platformOperator ? {} : { companyId: admin.companyId }),
    },
    orderBy: { id: "asc" },
    take: 50,
  });
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Assessment AI policy</h1>
      <p className="mt-2 text-sm text-zinc-600">Each assessment is AI allowed or not allowed. When it is not allowed, the candidate assistant stays off and no model is called.</p>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4">
          <h2 className="font-semibold">AI not allowed</h2>
          <p className="mt-2 text-sm">The assistant is off. Nothing is sent to a model.</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4">
          <h2 className="font-semibold">AI allowed</h2>
          <p className="mt-2 text-sm">The candidate can ask about the question. Every prompt and reply is stored for the reviewer.</p>
          <label className="mt-3 block text-sm" htmlFor="ask-preview">Ask about this question</label>
          <textarea id="ask-preview" className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={3} placeholder="The assistant answer is logged." />
        </div>
      </section>
      {invites.length === 0 ? <p className="mt-6 text-sm">No assessment invites yet.</p> : null}
      <ul className="mt-6 space-y-4">
        {invites.map((invite) => {
          const allowed = invite.aiUsePolicy === "AI_ALLOWED";
          const log = exchanges.filter((row) => row.inviteId === invite.id);
          return (
            <li key={invite.id} className="rounded-xl border border-zinc-200 p-4">
              <p className="font-semibold">{invite.application.candidate.name}</p>
              <p className="text-sm text-zinc-600">{invite.application.job.title}</p>
              <p className="mt-2 text-sm">{allowed ? "AI allowed. Prompts and replies are stored for the reviewer." : "AI not allowed. The assistant is off."}</p>
              {allowed ? (
                <form className="mt-3">
                  <label className="text-sm" htmlFor={`ask-${invite.id}`}>Ask about this question</label>
                  <textarea id={`ask-${invite.id}`} className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={3} placeholder="The assistant answer is logged." />
                </form>
              ) : null}
              {log.length > 0 ? (
                <ol className="mt-3 space-y-1 text-sm">
                  {log.map((row) => <li key={row.id}><span className="font-semibold">{row.role}:</span> {row.body}</li>)}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
