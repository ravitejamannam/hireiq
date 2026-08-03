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
          className={`text-sm font-semibold uppercase tracking-widest ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {eyebrow}
        </p>
      )}

      <h2
        className={`mt-2 text-4xl font-bold tracking-tight ${
          isDark ? "text-white" : "text-slate-900"
        }`}
      >
        {title}
      </h2>

      {description && (
        <p
          className={`mt-4 text-lg leading-8 ${
            isDark ? "text-slate-300" : "text-slate-600"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}