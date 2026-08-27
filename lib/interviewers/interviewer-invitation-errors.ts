import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";

export class InterviewerInvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewerInvitationError";
  }
}

export const INTERVIEWER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function validateInterviewerInviteEmail(email: unknown) {
  if (typeof email !== "string" || !email.trim()) {
    throw new InterviewerInvitationError("Work email is required.");
  }

  const normalized = normalizeIdentityEmail(email);
  if (!isPlausibleIdentityEmail(normalized)) {
    throw new InterviewerInvitationError("Work email is invalid.");
  }

  return normalized;
}

export function validateInterviewerInviteToken(token: unknown) {
  if (typeof token !== "string" || !token.trim()) {
    throw new InterviewerInvitationError("Invitation is invalid.");
  }

  return token.trim();
}

export function validateInterviewerInviteId(id: unknown) {
  if (
    typeof id !== "number" ||
    !Number.isFinite(id) ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new InterviewerInvitationError(
      "Invitation ID must be a positive integer.",
    );
  }

  return id;
}

export type InterviewerLoginStatus =
  | "ACTIVE"
  | "DISABLED"
  | "PENDING_INVITE"
  | "NO_LOGIN";

export function resolveInterviewerLoginStatus(input: {
  hasActiveUser: boolean;
  userDisabled: boolean;
  pendingInviteEmail: string | null;
}): InterviewerLoginStatus {
  if (input.hasActiveUser && input.userDisabled) {
    return "DISABLED";
  }
  if (input.hasActiveUser) {
    return "ACTIVE";
  }
  if (input.pendingInviteEmail) {
    return "PENDING_INVITE";
  }
  return "NO_LOGIN";
}
