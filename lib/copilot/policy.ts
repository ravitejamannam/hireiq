import { canonicalSkillKey } from "@/lib/ontology/skill-alias";

export const COPILOT_HISTORY_DAYS = 30;

const PROTECTED = /\b(gender|genders|woman|women|man\b|men\b|male|female|age|older|younger|religion|religious|caste|disability|disabled|race|racial|ethnicity|ethnic)\b/i;

export type CopilotCitation = {
  label: string;
  quote: string;
  href: string;
};

export function protectedQuestion(question: string) {
  return PROTECTED.test(question);
}

export function refusalForProtectedQuestion() {
  return "I can't rank or filter candidates by gender, age, religion, caste, disability, or similar traits. Those details are not used in hiring decisions here.";
}

export function unverifiedCitations(citations: CopilotCitation[], corpus: string[]) {
  return citations.filter((citation) => !corpus.some((source) => source.includes(citation.quote)));
}

export function answerWithCitations(input: { answer: string; citations: CopilotCitation[]; corpus: string[] }) {
  if (unverifiedCitations(input.citations, input.corpus).length > 0) {
    return { answer: "I couldn't verify that.", citations: [] as CopilotCitation[] };
  }
  return { answer: input.answer, citations: input.citations };
}

export function manualReviewListing(name: string) {
  return `${name}: Manual review`;
}

export function requirementMatchesSkill(input: { skill: string; key: string; quote: string | null; result: string }) {
  if (input.result !== "SATISFIED") return false;
  const skillKey = canonicalSkillKey(input.skill);
  const keyTail = input.key.split(":").pop() ?? input.key;
  if (canonicalSkillKey(keyTail) === skillKey) return true;
  if (input.quote && canonicalSkillKey(input.quote) === skillKey) return true;
  return `${input.key} ${input.quote ?? ""}`.toLowerCase().includes(input.skill.trim().toLowerCase());
}

export function pastCandidateHint(count: number) {
  if (count < 1) return null;
  return `${count} more in past candidates`;
}

export function formatCandidateSearch(input: {
  skill: string;
  ranked: Array<{ name: string; coverage: number | null }>;
  manual: string[];
}) {
  const shown = input.ranked.length + input.manual.length;
  const rankedText = input.ranked
    .map((row) => `${row.name} (${row.coverage == null ? "no coverage" : `${Math.round(row.coverage * 100)}%`})`)
    .join(", ");
  const body = [rankedText, ...input.manual].filter(Boolean).join(". ");
  if (shown === 0) {
    return `0 matches on this job's current applicants, fewer than 5. I don't have a stored match for ${input.skill}.`;
  }
  if (shown >= 5) return body;
  const noun = shown === 1 ? "match" : "matches";
  return `${shown} ${noun} on this job's current applicants, fewer than 5. ${body}`;
}

type TypingTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

export function copilotShortcutBlocked(target: TypingTarget | null) {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.getAttribute?.("role") === "textbox") return true;
  return Boolean(target.closest?.("input, textarea, select, [contenteditable], [role='textbox']"));
}

export type CopilotActorRole = "ADMIN" | "CLIENT" | "INTERVIEWER";

export function copilotActorFromUser(user: {
  id: number;
  role: string;
  companyId: number | null;
  interviewerId: number | null;
}) {
  const role: CopilotActorRole = user.role === "INTERVIEWER" ? "INTERVIEWER" : user.role === "ADMIN" ? "ADMIN" : "CLIENT";
  return {
    userId: user.id,
    role,
    companyId: user.companyId,
    interviewerId: user.interviewerId,
  };
}

export function copilotJobAllowed(input: {
  actor: { role: CopilotActorRole; companyId: number | null; interviewerId: number | null };
  jobCompanyId: number;
  assignedInterviewerId: number | null;
}) {
  if (input.actor.role === "INTERVIEWER") {
    if (input.actor.interviewerId == null || input.actor.interviewerId !== input.assignedInterviewerId) return false;
    if (input.actor.companyId != null && input.actor.companyId !== input.jobCompanyId) return false;
    return true;
  }
  return input.actor.companyId != null && input.actor.companyId === input.jobCompanyId;
}

export type CopilotAction = {
  kind: "shortlist" | "advance" | "send_draft";
  label: string;
  applicationIds: number[];
  draft: string | null;
  confirmed: boolean;
};

export function actionNeedsConfirmation(action: CopilotAction) {
  return action.confirmed === false;
}

export function draftMessage(input: { name: string; purpose: "invite" | "rejection" | "reschedule"; jobTitle: string }) {
  const opening = input.purpose === "invite"
    ? `We would like to invite you to apply for ${input.jobTitle}.`
    : input.purpose === "reschedule"
      ? `We need to reschedule your interview for ${input.jobTitle}.`
      : `Thank you for your time on ${input.jobTitle}. We will not be moving forward.`;
  return {
    draft: `Hi ${input.name},\n\n${opening}\n\nThis is a draft. It has not been sent.`,
    sent: false as const,
  };
}
