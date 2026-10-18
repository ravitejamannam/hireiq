import { enterPortal } from "@/app/portal/act/route";

type RouteProps = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: RouteProps) {
  const { token } = await params;
  const email = await enterPortal(token);
  if (!email) return Response.redirect(new URL("/portal?error=expired", request.url), 303);
  return Response.redirect(new URL("/portal/home", request.url), 303);
}
