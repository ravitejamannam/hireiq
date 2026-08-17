import { notFound, redirect } from "next/navigation";

import {
  AuthenticationError,
  AuthorizationError,
  requireClientPortal,
  requirePostAuthDestination,
} from "@/lib/auth/authorization";
import ClientPortalLayout from "@/components/client/ClientPortalLayout";

export default async function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let client;

  try {
    client = await requireClientPortal();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }

    if (error instanceof AuthorizationError) {
      try {
        const destination = await requirePostAuthDestination();
        if (destination === "/client") {
          notFound();
        }
        redirect(destination);
      } catch (redirectError) {
        if (redirectError instanceof AuthenticationError) {
          redirect("/login");
        }
        if (redirectError instanceof AuthorizationError) {
          notFound();
        }
        throw redirectError;
      }
    }

    throw error;
  }

  return (
    <ClientPortalLayout
      companyName={client.company.name}
      userName={client.name}
      isOwner={client.membershipRole === "OWNER"}
    >
      {children}
    </ClientPortalLayout>
  );
}
