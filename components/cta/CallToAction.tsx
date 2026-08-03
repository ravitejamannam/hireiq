import Button from "@/components/ui/Button";

export default function CallToAction() {
  return (
    <section className="bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-12 md:p-16">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Get Started
            </p>

            <h2 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
              Ready to hire better engineers?
            </h2>

            <p className="mt-6 text-lg leading-8 text-zinc-400">
              Stop relying on resumes alone. Evaluate engineering ability
              through expert-led technical interviews, structured feedback,
              and evidence-based hiring decisions.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button
                label="Get Started"
                variant="primary"
                onClick={() => alert("Coming Soon")}
              />

              <Button
                label="Contact Sales"
                variant="secondary"
                onClick={() => alert("Coming Soon")}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}