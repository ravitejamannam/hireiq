import { requireUser } from "@/lib/auth/authorization";
import { confirmCopilotAction, copilotActorFromUser } from "@/lib/copilot/copilot-service";

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const actor = copilotActorFromUser(user);
  if (actor.companyId == null) return new Response("You cannot access this job.", { status: 403 });
  const kind = String(form.get("kind") ?? "");
  if (kind !== "shortlist" && kind !== "advance" && kind !== "send_draft") {
    return new Response("The copilot cannot reject a candidate.", { status: 400 });
  }
  await confirmCopilotAction({
    actor,
    action: {
      kind,
      label: "Confirmed",
      applicationIds: String(form.get("applicationIds") ?? "").split(",").map(Number).filter((id) => id > 0),
      draft: null,
      confirmed: true,
    },
  });
  return Response.redirect(new URL("/dashboard", request.url), 303);
}
