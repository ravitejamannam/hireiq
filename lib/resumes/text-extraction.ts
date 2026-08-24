/**
 * Resume text extraction (T97 / §29).
 *
 * Versioned (RESUME_TEXT_EXTRACTOR_VERSION) so historical evidence stays
 * reproducible and re-extraction is a deliberate, tracked change.
 *
 * Fail-closed: unsupported or unreadable files return a failure result —
 * the stored binary is retained for retry after a parser fix, mirroring
 * the webhook quarantine philosophy.
 */

export const RESUME_TEXT_EXTRACTOR_VERSION = "2"; // v2 adds DOCX

export const RESUME_TEXT_MAX = 8000; // aligns with EVIDENCE_INLINE_TEXT_MAX

export type ExtractionOutcome =
  | { ok: true; text: string }
  | { ok: false; errorCode: string };

function truncate(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= RESUME_TEXT_MAX) return normalized;
  return normalized.slice(0, RESUME_TEXT_MAX);
}

async function extractFromPdf(bytes: Buffer): Promise<ExtractionOutcome> {
  try {
    // Dynamic import: pdf-parse is only needed when a PDF actually arrives.
    const mod = await import("pdf-parse");
    const { PDFParse } = mod as unknown as {
      PDFParse: new (options: { data: Uint8Array }) => {
        getText(): Promise<{ text: string }>;
        destroy(): Promise<void>;
      };
    };
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const result = await parser.getText();
      const text = typeof result.text === "string" ? result.text : "";
      if (!text.trim()) {
        return { ok: false, errorCode: "PDF_NO_TEXT_LAYER" };
      }
      return { ok: true, text: truncate(text) };
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    // Log the underlying reason server-side (no candidate data) so parser
    // issues are diagnosable; the caller still fails closed.
    console.error("[resume-extraction] pdf parse failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, errorCode: "PDF_PARSE_FAILED" };
  }
}


async function extractFromDocx(bytes: Buffer): Promise<ExtractionOutcome> {
  try {
    // Dynamic import keeps mammoth out of every code path.
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    const text = typeof result.value === "string" ? result.value : "";
    if (!text.trim()) {
      return { ok: false, errorCode: "DOCX_NO_TEXT" };
    }
    return { ok: true, text: truncate(text) };
  } catch {
    return { ok: false, errorCode: "DOCX_PARSE_FAILED" };
  }
}

function extractFromText(bytes: Buffer): ExtractionOutcome {
  const decoded = bytes.toString("utf8");
  // Heuristic binary sniff: replacement chars suggest non-text content.
  const replacementRatio =
    (decoded.match(/\uFFFD/g) ?? []).length / Math.max(decoded.length, 1);
  if (replacementRatio > 0.05) {
    return { ok: false, errorCode: "BINARY_CONTENT_REJECTED" };
  }
  if (!decoded.trim()) {
    return { ok: false, errorCode: "EMPTY_DOCUMENT" };
  }
  return { ok: true, text: truncate(decoded) };
}

/** Sniffs real content type from magic bytes. Never trusts the client MIME. */
export function sniffResumeKind(
  bytes: Buffer,
): "pdf" | "docx" | "text" | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "pdf";
  }
  // DOCX is a ZIP: PK\x03\x04
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "docx";
  }
  return "text";
}

export async function extractResumeText(bytes: Buffer): Promise<ExtractionOutcome> {
  const kind = sniffResumeKind(bytes);
  if (kind === "pdf") return extractFromPdf(bytes);
  if (kind === "docx") return extractFromDocx(bytes);
  if (kind === "text") return extractFromText(bytes);
  return { ok: false, errorCode: "UNSUPPORTED_FORMAT" };
}
