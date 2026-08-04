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
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <h1 className="text-3xl font-bold text-black">{title}</h1>

        <p className="mt-2 text-zinc-600">{subtitle}</p>

        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
