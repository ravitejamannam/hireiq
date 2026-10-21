export const INBOUND_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const INBOUND_MESSAGE_MAX_BYTES = 6 * 1024 * 1024;
export const INBOUND_MAX_ATTACHMENTS = 5;

const ALLOWED = new Set(["pdf", "docx", "txt"]);

export type AttachmentDecision =
  | { ok: true; extension: "pdf" | "docx" | "txt"; fileName: string }
  | { ok: false; code: string };

export function inspectAttachment(input: { fileName: string; bytes: Buffer }): AttachmentDecision {
  if (input.bytes.length === 0) return { ok: false, code: "EMPTY_ATTACHMENT" };
  if (input.bytes.length > INBOUND_ATTACHMENT_MAX_BYTES) return { ok: false, code: "ATTACHMENT_TOO_LARGE" };
  const base = input.fileName.split(/[/\\]/).pop()?.replace(/[^\w.\- ]+/g, "") ?? "";
  const extension = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!ALLOWED.has(extension)) return { ok: false, code: "UNSUPPORTED_FILE_TYPE" };
  if (input.bytes.subarray(0, 2).toString("binary") === "MZ") return { ok: false, code: "UNSUPPORTED_FILE_TYPE" };
  if (extension === "pdf" && !input.bytes.subarray(0, 5).toString("utf8").startsWith("%PDF-")) {
    return { ok: false, code: "MALFORMED_ATTACHMENT" };
  }
  if (extension === "docx" && input.bytes.subarray(0, 2).toString("binary") !== "PK") {
    return { ok: false, code: "MALFORMED_ATTACHMENT" };
  }
  if (extension === "txt" && input.bytes.includes(0)) return { ok: false, code: "MALFORMED_ATTACHMENT" };
  return { ok: true, extension: extension as "pdf" | "docx" | "txt", fileName: base.slice(0, 120) || `resume.${extension}` };
}

export function selectResumeAttachment(
  attachments: Array<{ fileName: string; bytes: Buffer }>,
): { chosen: { fileName: string; bytes: Buffer; extension: "pdf" | "docx" | "txt" } | null; code: string | null; extra: number } {
  if (attachments.length > INBOUND_MAX_ATTACHMENTS) {
    return { chosen: null, code: "TOO_MANY_ATTACHMENTS", extra: attachments.length };
  }
  let chosen: { fileName: string; bytes: Buffer; extension: "pdf" | "docx" | "txt" } | null = null;
  let firstError: string | null = null;
  let extra = 0;
  for (const attachment of attachments) {
    const decision = inspectAttachment(attachment);
    if (!decision.ok) {
      firstError ??= decision.code;
      continue;
    }
    if (!chosen) chosen = { fileName: decision.fileName, bytes: attachment.bytes, extension: decision.extension };
    else extra += 1;
  }
  if (!chosen && attachments.length > 0) return { chosen: null, code: firstError, extra };
  return { chosen, code: extra > 0 ? "EXTRA_ATTACHMENTS" : null, extra };
}
