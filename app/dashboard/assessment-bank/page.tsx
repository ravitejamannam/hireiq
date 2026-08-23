import BankHealthClient from "@/components/assessments/BankHealthClient";
import { requireAdmin } from "@/lib/auth/authorization";
import { getAssessmentBankHealthForAdmin } from "@/lib/assessments/bank-health-service";

export const dynamic = "force-dynamic";

export default async function AssessmentBankPage() {
  await requireAdmin();
  const health = await getAssessmentBankHealthForAdmin();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Assessment bank</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Exposure tracking for role assessments. Questions are drawn
          least-used-first; retire over-exposed items so answer keys don&apos;t
          leak. Retired questions stay valid for historical scores.
        </p>
      </header>

      <BankHealthClient health={health} />
    </div>
  );
}
