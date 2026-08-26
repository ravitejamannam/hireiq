import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-[#FBF9F4]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-black text-white">
            Hi
          </span>
          <span className="text-sm font-bold text-zinc-900">HireIQ</span>
          <span className="text-xs text-zinc-400">· Hiring you can prove.</span>
        </div>
        <nav className="flex items-center gap-6 text-xs font-medium text-zinc-500">
          <Link href="/login" className="transition hover:text-zinc-900">
            Log in
          </Link>
          <Link href="/signup" className="transition hover:text-zinc-900">
            Sign up
          </Link>
          <a href="#faq" className="transition hover:text-zinc-900">
            FAQ
          </a>
        </nav>
      </div>
    </footer>
  );
}
