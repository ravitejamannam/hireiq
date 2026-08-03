type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  theme?: "light" | "dark";
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  theme = "light",
}: SectionHeadingProps) {
  const isDark = theme === "dark";

  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p
          className={`text-sm font-semibold uppercase tracking-[0.2em] ${
            isDark ? "text-zinc-500" : "text-zinc-500"
          }`}
        >
          {eyebrow}
        </p>
      )}

      <h2
        className={`mt-4 text-4xl font-bold tracking-tight md:text-5xl ${
          isDark ? "text-white" : "text-zinc-900"
        }`}
      >
        {title}
      </h2>

      {description && (
        <p
          className={`mt-6 text-lg leading-8 ${
            isDark ? "text-zinc-400" : "text-zinc-600"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}