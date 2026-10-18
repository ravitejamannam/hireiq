export type EvidenceDecision = { applicationId: number; status: "MEETS" | "NOT_MET" | "UNKNOWN" };

export function nameSwapFlipRate(input: {
  baseline: EvidenceDecision[];
  swapped: EvidenceDecision[];
}) {
  const swappedById = new Map(input.swapped.map((row) => [row.applicationId, row.status]));
  const comparable = input.baseline.filter((row) => swappedById.has(row.applicationId));
  if (comparable.length === 0) return 0;
  const flips = comparable.filter((row) => swappedById.get(row.applicationId) !== row.status);
  return flips.length / comparable.length;
}
