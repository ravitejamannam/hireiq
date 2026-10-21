/**
 * Malware-scan boundary for inbound attachments.
 *
 * No scanner is configured in this repository. This module does not call a
 * network service and does not contain provider credentials.
 *
 * A future scanner must implement AttachmentScanner and return clean or
 * infected. Until then, scanAttachment reports unavailable. Callers still
 * run content checks first. An infected result is quarantine: the bytes are
 * not stored and are not passed to the resume parser. Unavailable is not a
 * clean scan and must not be described as malware protection.
 */

export type AttachmentScanStatus = "clean" | "infected" | "unavailable";

export type AttachmentScanResult = {
  status: AttachmentScanStatus;
};

export interface AttachmentScanner {
  scan(bytes: Buffer): Promise<AttachmentScanResult>;
}

const unavailableScanner: AttachmentScanner = {
  async scan() {
    return { status: "unavailable" };
  },
};

let scannerOverride: AttachmentScanner | null = null;

export function attachmentScanner(): AttachmentScanner {
  return scannerOverride ?? unavailableScanner;
}

/** Tests only. Pass null to restore the unavailable scanner. */
export function setAttachmentScannerForTests(scanner: AttachmentScanner | null) {
  scannerOverride = scanner;
}

export async function scanAttachment(bytes: Buffer): Promise<AttachmentScanResult> {
  return attachmentScanner().scan(bytes);
}
