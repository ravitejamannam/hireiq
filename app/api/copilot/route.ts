import { requireUser } from "@/lib/auth/authorization";
import { answerCopilot, copilotActorFromUser } from "@/lib/copilot/copilot-service";
import { proposeFilters } from "@/lib/copilot/structured-filters";

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
  const filters = proposeFilters(String(body.question ?? ""));
  const payload = `${result.answer}\n\n${JSON.stringify({ citations: result.citations, action: result.action, link: result.link, filters })}`;
  const pieces = payload.split(/(\s+)/);
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
