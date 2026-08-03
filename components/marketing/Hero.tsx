import Button from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="bg-black">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <p className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300">
          Expert-led technical hiring platform
        </p>

        <h1 className="mt-8 max-w-5xl text-5xl font-bold tracking-tight text-white md:text-7xl">
          Hire engineers with confidence.
        </h1>

        <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-400">
          Evaluate engineering ability through expert-led technical interviews,
          structured feedback, and evidence-based hiring decisions.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Button
            label="Get Started"
            variant="primary"
            onClick={() => alert("Coming Soon")}
          />

          <Button
            label="Book a Demo"
            variant="secondary"
            onClick={() => alert("Coming Soon")}
          />
        </div>
      </div>
    </section>
  );
}