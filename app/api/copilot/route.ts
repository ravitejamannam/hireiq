import { requireUser } from "@/lib/auth/authorization";
import { answerCopilot, copilotActorFromUser } from "@/lib/copilot/copilot-service";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = (await request.json()) as { question?: string; jobId?: number | null; companyId?: number };
  const actor = copilotActorFromUser(user);
  if (actor.role !== "INTERVIEWER" && actor.companyId == null) {
    return new Response("You cannot access this job.", { status: 403 });
  }
  const result = await answerCopilot({
    actor,
    companyId: actor.companyId ?? 0,
    jobId: body.jobId ? Number(body.jobId) : null,
    question: String(body.question ?? ""),
  });
  const payload = `${result.answer}\n\n${JSON.stringify({ citations: result.citations, action: result.action, link: result.link })}`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
