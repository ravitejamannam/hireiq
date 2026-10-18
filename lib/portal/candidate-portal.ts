export const PORTAL_LINK_TTL_MS = 30 * 60 * 1000;
export const PORTAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PORTAL_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type PortalApplication = {
  id: number;
  candidateId: number;
  status: string;
  interviews: Array<{ id: number; at: string }>;
  assessmentLinks: string[];
  documents: string[];
  notice: string | null;
  optedOut: boolean;
};

export type PortalNoticeKind = "decision" | "magic_link" | "deletion" | "stage" | "interview" | "assessment";

export function linkExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function sessionExpiry(now = new Date()) {
  return new Date(now.getTime() + PORTAL_SESSION_TTL_MS);
}

export function normalizePortalEmail(email: string) {
  return email.trim().toLowerCase();
}

export function documentRejection(input: { contentType: string; sizeBytes: number }) {
  if (!DOCUMENT_TYPES.has(input.contentType)) return "Upload a PDF or Word file.";
  if (input.sizeBytes <= 0 || input.sizeBytes > PORTAL_MAX_UPLOAD_BYTES) return "Files must be 5 MB or smaller.";
  return null;
}

export function parseStatusLabel(status: string) {
  if (status === "PARSED") return "We read this file.";
  if (status === "UNREADABLE") return "We couldn't read this scan, upload a text PDF.";
  if (status === "STORED") return "Saved. This file is not parsed.";
  return "We're reading this file.";
}

export function nextPortalAction(input: {
  withdrawn: boolean;
  hasResume: boolean;
  pendingAssessment: boolean;
  needsInterview: boolean;
}) {
  if (input.withdrawn) return null;
  if (input.needsInterview) return "Book interview" as const;
  if (input.pendingAssessment) return "Take assessment" as const;
  if (!input.hasResume) return "Upload document" as const;
  return null;
}

export function maySendCandidateEmail(input: { unsubscribed: boolean; kind: PortalNoticeKind }) {
  if (input.kind === "decision" || input.kind === "magic_link" || input.kind === "deletion") return true;
  return !input.unsubscribed;
}

export function portalExport(input: {
  email: string;
  applications: Array<{
    id: number;
    job: string;
    company: string;
    stage: string;
    withdrawn: boolean;
    interviews: Array<{ at: string; type: string; meetUrl: string | null }>;
    assessments: Array<{ submittedAt: string | null; deadline: string }>;
    documents: Array<{ fileName: string; kind: string; parseStatus: string }>;
    files: Array<{ fileName: string; kind: string; contentBase64: string | null }>;
  }>;
}) {
  return {
    email: input.email,
    exportedAt: new Date().toISOString(),
    applications: input.applications,
  };
}

export function icsEvent(input: { uid: string; title: string; start: Date; end: Date; meetUrl: string | null }) {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HireIQ//Portal//EN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(input.start)}`,
    `DTEND:${stamp(input.end)}`,
    `SUMMARY:${input.title}`,
    input.meetUrl ? `URL:${input.meetUrl}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function formatInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function portalView(input: {
  actorCandidateId: number;
  applications: PortalApplication[];
}) {
  return input.applications.filter((row) => row.candidateId === input.actorCandidateId);
}

export function requestHumanReview(at: Date) {
  return { humanReviewRequestedAt: at.toISOString() };
}
