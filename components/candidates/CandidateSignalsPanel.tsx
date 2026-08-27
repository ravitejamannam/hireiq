import { requireAdmin } from "@/lib/auth/authorization";
import { getDecisionSupportForCandidate } from "@/lib/candidates/decision-support-service";
import DecisionSupportRails from "@/components/candidates/DecisionSupportRails";

export default async function DecisionSupportHero({
  candidateId,
}: {
  candidateId: number;
}) {
  await requireAdmin();

  let signals: Awaited<
    ReturnType<typeof getDecisionSupportForCandidate>
  >["signals"] | null = null;
  try {
    const view = await getDecisionSupportForCandidate(candidateId);
    signals = view.signals;
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { code?: string }).code === "CANDIDATE_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }

  return <DecisionSupportRails signals={signals} />;
}
