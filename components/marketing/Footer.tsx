import Link from "next/link";

import HireIqLogo from "@/components/brand/HireIqLogo";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-[#FBF9F4]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <HireIqLogo markSize={28} />
          <span className="text-xs text-zinc-400">· Hiring you can prove.</span>
        </div>
        <nav className="flex items-center gap-6 text-xs font-medium text-zinc-500">
          <Link href="/careers" className="transition hover:text-zinc-900">
            Careers
          </Link>
          <Link href="/login" className="transition hover:text-zinc-900">
            Log in
          </Link>
          <Link href="/signup" className="transition hover:text-zinc-900">
            Sign up
          </Link>
          <Link href="/#faq" className="transition hover:text-zinc-900">
            FAQ
          </Link>
          <a
            href="mailto:founder@hireiq.today"
            className="transition hover:text-zinc-900"
          >
            founder@hireiq.today
          </a>
        </nav>
      </div>
    </footer>
  );
}
