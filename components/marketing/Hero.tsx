import Button from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
        Hire better developers with AI
      </h1>

      <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
        Screen candidates, run coding interviews, and evaluate technical skills
        faster.
      </p>

      <div className="mt-10 flex gap-4">
        <Button
          label="Get Started"
          variant="primary"
          onClick={() => alert("Get Started")}
        />

        <Button
          label="Live Demo"
          variant="secondary"
          onClick={() => alert("Live Demo")}
        />
      </div>
    </section>
  );
}
