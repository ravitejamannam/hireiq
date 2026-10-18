import { requireAdmin } from "@/lib/auth/authorization";
import { SHADOW_REQUIRED, REVERSE_SHADOW_REQUIRED } from "@/lib/interviewers/qualification";
import { translate } from "@/lib/i18n/catalog";

export const dynamic = "force-dynamic";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  await requireAdmin();
  const { lang } = await searchParams;
  const locale = lang === "hi" ? "hi" : "en";
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{translate(locale, "trainingTitle").text}</h1>
      <p className="mt-2 text-sm text-zinc-600">{translate(locale, "trainingIntro").text}</p>
      <p className="mt-4 text-sm">Shadow sessions required: {SHADOW_REQUIRED}. Reverse-shadow sessions required: {REVERSE_SHADOW_REQUIRED}.</p>
      <p className="mt-2 text-sm">A company can require this qualified flag before someone is assigned as the lead interviewer.</p>
    </main>
  );
}
