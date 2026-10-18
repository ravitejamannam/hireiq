const DAYS: Record<string, number> = {
  GDPR: 180,
  CALIFORNIA: 1460,
};

export function retentionDays(jurisdiction: string) {
  const days = DAYS[jurisdiction.toUpperCase()];
  if (!days) throw new Error(`Unknown jurisdiction ${jurisdiction}.`);
  return days;
}

export function retentionDue(input: { jurisdiction: string; receivedAt: Date }) {
  const due = new Date(input.receivedAt);
  due.setUTCDate(due.getUTCDate() + retentionDays(input.jurisdiction));
  return due;
}

export type DsarBundle = {
  candidateId: number;
  applications: unknown[];
  aiOutputs: unknown[];
};

export function dsarExport(input: DsarBundle) {
  return {
    candidateId: input.candidateId,
    applications: input.applications,
    aiOutputs: input.aiOutputs,
    exportedAt: new Date().toISOString(),
  };
}

export function anonymiseCandidate(input: { name: string; email: string; phone: string | null }) {
  return {
    name: "Deleted candidate",
    email: `deleted-${hash(input.email)}@example.invalid`,
    phone: null as string | null,
  };
}

function hash(value: string) {
  let total = 0;
  for (const char of value) total = (total + char.charCodeAt(0)) % 100000;
  return String(total);
}
