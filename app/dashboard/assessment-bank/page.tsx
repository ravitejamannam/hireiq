import BankAdminClient from "@/components/assessments/BankAdminClient";
import BankHealthClient from "@/components/assessments/BankHealthClient";
import { requireAdmin } from "@/lib/auth/authorization";
import { listBankQuestions } from "@/lib/assessments/bank-admin-service";
import { getAssessmentBankHealthForAdmin } from "@/lib/assessments/bank-health-service";

export const dynamic = "force-dynamic";

export default async function AssessmentBankPage() {
  await requireAdmin();
  const [health, bank] = await Promise.all([
    getAssessmentBankHealthForAdmin(),
    listBankQuestions(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Assessment bank</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Manage the live question bank: create items with difficulty tiers,
          retire over-exposed questions, and track exposure. Retired questions
          stay valid for historical scores. Invites draw a randomised mix from
          the least-used active pool.
        </p>
      </header>

      <BankHealthClient health={health} />

      {bank.ok ? (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Questions</h2>
          <BankAdminClient initialQuestions={bank.questions} />
        </section>
      ) : (
        <p className="text-sm text-red-600">{bank.error}</p>
      )}
    </div>
  );
}
