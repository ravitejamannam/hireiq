import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PortalLoginView } from "@/components/portal/PortalViews";
import { PORTAL_COOKIE, readPortalSession } from "@/lib/portal/portal-session";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const session = readPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (session) redirect("/portal/home");
  const query = await searchParams;
  return (
    <PortalLoginView
      sent={query.sent === "1"}
      error={
        query.error === "expired"
          ? "That link expired. Request a fresh one."
          : query.error === "invalid"
            ? "Enter the email you applied with."
            : query.error === "rate"
              ? "Too many sign-in links were requested. Try again in an hour."
              : null
      }
    />
  );
}
