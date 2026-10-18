export const REJECTION_REASONS = [
  { code: "KNOCKOUT", label: "Knockout answer" },
  { code: "REQUIREMENTS", label: "Requirements not met" },
  { code: "ROLE_CLOSED", label: "Role closed" },
  { code: "CANDIDATE_WITHDREW", label: "Candidate withdrew" },
] as const;

export function rejectionReason(code: string) {
  const match = REJECTION_REASONS.find((row) => row.code === code);
  if (!match) throw new Error(`Unknown rejection reason ${code}.`);
  return match;
}

export function blindReviewView<T extends { name: string; email: string; photoUrl?: string | null }>(
  person: T,
  blind: boolean,
) {
  if (!blind) return person;
  return { ...person, name: "Candidate", email: "", photoUrl: null };
}

export type QueueItem = { id: number };

export function applyQueueKey(items: QueueItem[], selectedId: number, key: "j" | "k" | "x") {
  const index = items.findIndex((item) => item.id === selectedId);
  if (key === "j") return items[Math.min(items.length - 1, index + 1)]?.id ?? selectedId;
  if (key === "k") return items[Math.max(0, index - 1)]?.id ?? selectedId;
  return selectedId;
}

export function rejectionEmailDraft(input: { candidateName: string; role: string; reasonLabel: string }) {
  return {
    subject: `Update on ${input.role}`,
    body: `Hello ${input.candidateName},\n\nThank you for your time. We will not be moving forward because: ${input.reasonLabel}.\n`,
    requiresHumanSend: true,
  };
}

export function decisionRecord(input: { applicationId: number; rationale: string; decidedByUserId: number }) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new Error("A decision record needs a rationale.");
  return { ...input, rationale };
}

export function parseCandidateCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0]?.split(",").map((cell) => cell.trim()) ?? [];
  const nameIndex = header.indexOf("name");
  const emailIndex = header.indexOf("email");
  if (nameIndex < 0 || emailIndex < 0) throw new Error("CSV needs name and email columns.");
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return { name: cells[nameIndex] ?? "", email: cells[emailIndex] ?? "" };
  });
}

export function pipelineTemplate(name: string, stages: string[]) {
  if (stages.length === 0) throw new Error("A pipeline template needs stages.");
  return { name, stages };
}

export function jobTemplate(name: string, payload: { title: string; level?: string | null }) {
  if (!payload.title.trim()) throw new Error("A job template needs a title.");
  return { name, payload };
}

export function jobApprovedForPublish(input: { publishApprovedAt: Date | null }) {
  return input.publishApprovedAt !== null;
}
