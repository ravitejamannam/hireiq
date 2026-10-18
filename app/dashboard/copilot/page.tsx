import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CompanyCopilotPage() {
  const company = await prisma.company.findFirst({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  if (!company) return <main className="p-8">No company yet.</main>;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Copilot</h1>
      <p className="mt-2 text-sm">Ask across {company.name}. Open a job page to stay scoped to one pipeline.</p>
      <CopilotPanel jobId={null} companyId={company.id} />
    </main>
  );
}
