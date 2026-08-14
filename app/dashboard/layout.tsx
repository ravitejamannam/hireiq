import { notFound, redirect } from "next/navigation";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";

export default async function AdminPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }

    if (error instanceof AuthorizationError) {
      notFound();
    }

    throw error;
  }

  return children;
}
