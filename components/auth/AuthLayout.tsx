import Link from "next/link";

import HireIqLogo from "@/components/brand/HireIqLogo";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export default function AuthLayout({
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F7F4EE] px-6 py-12">
      {/* soft corner glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-sky-100/60 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          aria-label="HireIQ"
          className="mb-8 flex items-center justify-center"
        >
          <HireIqLogo markSize={40} />
        </Link>

        <div className="rounded-3xl border border-stone-200/80 bg-white p-8 shadow-xl shadow-stone-200/50 sm:p-10">
          <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {subtitle}
          </p>
          <div className="mt-8">{children}</div>
        </div>

        <p className="mt-6 text-center text-xs text-stone-400">
          Hiring you can prove — every decision traceable to evidence.
        </p>
      </div>
    </main>
  );
}
