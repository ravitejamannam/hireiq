import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Continue",
};

import { redirect } from "next/navigation";

import {
  AuthenticationError,
  requirePostAuthDestination,
} from "@/lib/auth/authorization";

export default async function PostAuthPage() {
  let destination: string;
  try {
    destination = await requirePostAuthDestination();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }
    throw error;
  }

  redirect(destination);
}
