import { notFound, redirect } from "next/navigation";

import {
  AuthenticationError,
  AuthorizationError,
  requireClientPortal,
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
      notFound();
    }

    throw error;
  }

  return (
    <ClientPortalLayout
      companyName={client.company.name}
      userName={client.name}
    >
      {children}
    </ClientPortalLayout>
  );
}
