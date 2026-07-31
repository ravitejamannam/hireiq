import Button from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-6xl font-bold">
        HireIQ
      </h1>

      <p className="text-lg text-gray-600">
        AI-powered technical hiring platform
      </p>

      <Button
        label="Get Started"
        variant="primary"
        onClick={() => alert("Coming soon")}
      />
    </section>
  );
}
