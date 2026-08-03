import Button from "@/components/ui/Button";

export default function CallToAction() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="rounded-3xl bg-slate-900 px-8 py-16 text-center text-white">
        <h2 className="text-4xl font-bold">
          Ready to hire better engineers?
        </h2>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
          Stop relying on resumes alone. Evaluate technical skills with experienced engineers and hire with confidence.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
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
    </section>
  );
}