export type IdentityKey = {
  candidateId: number;
  email?: string | null;
  phone?: string | null;
};

export function duplicateGroups(rows: IdentityKey[]) {
  const groups: number[][] = [];
  const used = new Set<number>();
  for (const row of rows) {
    if (used.has(row.candidateId)) continue;
    const peers = rows.filter((other) => {
      if (other.candidateId === row.candidateId) return false;
      const email = row.email && other.email && row.email.toLowerCase() === other.email.toLowerCase();
      const phone = row.phone && other.phone && digits(row.phone) === digits(other.phone);
      return Boolean(email || phone);
    });
    if (peers.length === 0) continue;
    const ids = [row.candidateId, ...peers.map((peer) => peer.candidateId)];
    ids.forEach((id) => used.add(id));
    groups.push(ids);
  }
  return groups;
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function recordConsent(input: { noticeVersion: string; at: Date }) {
  return { applyNoticeVersion: input.noticeVersion, consentAt: input.at.toISOString() };
}
