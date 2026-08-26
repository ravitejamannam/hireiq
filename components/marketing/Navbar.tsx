import Link from "next/link";

const links = [
  { label: "Ideology", href: "#ideology" },
  { label: "How it works", href: "#workflow" },
  { label: "Proof", href: "#proof" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-[#FBF9F4]/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-sm font-black text-[#FBF9F4]">
            Hi
          </span>
          <span className="text-xl font-bold tracking-tight text-stone-900">
            HireIQ
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-200/60"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-[#FBF9F4] transition hover:bg-stone-700"
          >
            Start hiring
          </Link>
        </div>
      </nav>
    </header>
  );
}
