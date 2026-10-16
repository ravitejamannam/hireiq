import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">404</p>
      <h1 className="mt-2 text-3xl font-bold text-black">This page does not exist</h1>
      <p className="mt-3 text-zinc-600">
        The address is not a HireIQ page. Nothing was changed.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-black underline">
        Go to HireIQ
      </Link>
    </main>
  );
}
