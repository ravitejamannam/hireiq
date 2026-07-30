export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-extrabold tracking-tight text-slate-900">
          HireIQ
        </h1>

        <p className="mt-4 text-lg text-slate-600">
          AI-assisted technical hiring platform.
        </p>

        <button className="mt-8 rounded-lg bg-slate-900 px-6 py-3 text-white transition hover:bg-slate-700">
          Get Started
        </button>
      </div>
    </main>
  );
}
