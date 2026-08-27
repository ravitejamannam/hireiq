/** Exact integer math: no floats touch money. */
export function computeMarkupFeeCents(
  placedCtcCents: number,
  markupBps: number,
): number {
  return Math.round((placedCtcCents * markupBps) / 10_000);
}

/** Format paise/cents → rupee string for transparent displays. */
export function formatCents(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN")}`;
}
