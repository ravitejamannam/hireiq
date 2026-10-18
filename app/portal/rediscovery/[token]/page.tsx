import { acceptRediscoveryInvite } from "@/lib/talent/rediscovery-service";

type RouteProps = { params: Promise<{ token: string }> };

export default async function AcceptRediscoveryPage({ params }: RouteProps) {
  const { token } = await params;
  const application = await acceptRediscoveryInvite(token);
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">{application ? "Application started" : "This invitation is closed"}</h1>
      <p className="mt-2 text-sm">
        {application
          ? "You accepted the invitation. An application now exists for this role."
          : "The link expired, was already used, or could not be found."}
      </p>
    </main>
  );
}
