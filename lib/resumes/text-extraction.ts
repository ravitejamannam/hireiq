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

import { getOpenAiApiKey } from "@/lib/ai/job-description-generator";
import { betterExtraction, columnJumbleShare, scoreExtraction, textLooksColumnJumbled, type ExtractionQuality } from "@/lib/resumes/extraction-quality";
import {
  applicationOptedOutOfAi,
  transcribeResumePage,
  type ResumeVisionAudit,
} from "@/lib/resumes/layout-vision";

export const RESUME_TEXT_EXTRACTOR_VERSION = "4";

/** A single file cannot hold the upload request open longer than this. */
export const RESUME_PARSE_TIMEOUT_MS = 25_000;

/** Long enough for multi-role resumes. Evidence inline text uses the same cap. */
export const RESUME_TEXT_MAX = 30_000;

const OCR_MAX_PAGES = 3;

export type ExtractionOutcome =
  | { ok: true; text: string; quality: ExtractionQuality; extractor: string }
  | { ok: false; errorCode: string };

export type ParseControl = {
  aborted: boolean;
  stop: () => void;
};

export function createParseControl(): ParseControl {
  const control: ParseControl = {
    aborted: false,
    stop: () => {
      control.aborted = true;
    },
  };
  return control;
}

export type ResumeFileHint = {
  fileName?: string;
  contentType?: string;
  /**
   * inline runs Tesseract in this process (the background OCR job).
   * skip leaves a text-free PDF as OCR_DEFERRED so the upload can return.
   */
  ocr?: "inline" | "skip";
  /** Present when the caller has a company id and a Prisma client. */
  visionAudit?: Omit<ResumeVisionAudit, "pageCount" | "pageIndex"> | null;
};

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "heic",
]);

function truncate(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= RESUME_TEXT_MAX) return normalized;
  return normalized.slice(0, RESUME_TEXT_MAX);
}

function extensionOf(fileName: string | undefined): string {
  if (!fileName) return "";
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function mimeOf(contentType: string | undefined): string {
  if (!contentType) return "";
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function startsWith(bytes: Buffer, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function isZip(bytes: Buffer): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);
}

function isOleCompound(bytes: Buffer): boolean {
  return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

function isImageMagic(bytes: Buffer): boolean {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return true;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return true;
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return true;
  if (startsWith(bytes, [0x42, 0x4d])) return true;
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return true;
  }
  return false;
}

/** DOCX stores the document part name in plaintext inside the ZIP headers. */
export function zipContainsWordDocument(bytes: Buffer): boolean {
  return bytes.includes(Buffer.from("word/document.xml"));
}

type SniffedKind = "pdf" | "docx" | "text" | "image" | "legacy-doc" | "unsupported";

/**
 * Classify from magic bytes, then check the declared extension and MIME.
 * A mismatch (a PNG named .pdf, a ZIP that is not a Word file) is unsupported.
 */
export function sniffResumeKind(bytes: Buffer, hint: ResumeFileHint = {}): SniffedKind {
  const extension = extensionOf(hint.fileName);
  const mime = mimeOf(hint.contentType);

  const declaredImage =
    IMAGE_EXTENSIONS.has(extension) || mime.startsWith("image/");
  const declaredLegacyDoc =
    extension === "doc" || mime === "application/msword";
  const declaredPdf = extension === "pdf" || mime === "application/pdf";
  const declaredDocx =
    extension === "docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const declaredText = extension === "txt" || mime === "text/plain";

  if (declaredImage || isImageMagic(bytes)) return "image";
  if (declaredLegacyDoc || isOleCompound(bytes)) return "legacy-doc";

  const pdfMagic = bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (pdfMagic) {
    if (declaredDocx || declaredText) return "unsupported";
    return "pdf";
  }
  if (declaredPdf) return "unsupported";

  if (isZip(bytes)) {
    if (declaredText) return "unsupported";
    if (zipContainsWordDocument(bytes)) return "docx";
    return "unsupported";
  }
  if (declaredDocx) return "unsupported";

  if (extension && !declaredText && extension !== "pdf" && extension !== "docx") {
    return "unsupported";
  }
  if (mime && !declaredText && mime !== "application/octet-stream") {
    return "unsupported";
  }
  return "text";
}

function withQuality(text: string, extractor: string): ExtractionOutcome {
  return { ok: true, text: truncate(text), quality: scoreExtraction(text), extractor };
}

async function extractFromPdf(
  bytes: Buffer,
  hint: ResumeFileHint,
  control: ParseControl,
): Promise<ExtractionOutcome> {
  const started = Date.now();
  let best: { text: string; quality: ExtractionQuality; extractor: string } | null = null;
  let sawParserError = false;
  const remember = (
    current: { text: string; quality: ExtractionQuality; extractor: string } | null,
    text: string,
    extractor: string,
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return current;
    const next = { text: trimmed, quality: scoreExtraction(trimmed), extractor };
    const chosen = current ? betterExtraction(current, next) : next;
    return { ...chosen, extractor: chosen === next ? extractor : current!.extractor };
  };

  try {
    const mod = await import("pdf-parse");
    const { PDFParse } = mod as unknown as {
      PDFParse: new (options: { data: Uint8Array }) => {
        getText(params?: { pageJoiner?: string }): Promise<{ text: string }>;
        getInfo(): Promise<{ total?: number }>;
        getScreenshot(params?: {
          imageBuffer?: boolean;
          imageDataUrl?: boolean;
          scale?: number;
          first?: number;
        }): Promise<{ pages?: Array<{ data?: Uint8Array }> }>;
        destroy(): Promise<void>;
      };
    };
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    let tess: { terminate: () => Promise<unknown> } | null = null;
    const previousStop = control.stop;
    control.stop = () => {
      previousStop();
      void parser.destroy().catch(() => undefined);
      if (tess) void tess.terminate().catch(() => undefined);
    };
    try {
      const result = await parser.getText({ pageJoiner: "" });
      best = remember(best, typeof result.text === "string" ? result.text : "", "pdf-parse");
      if (!best || best.quality.wordCount < 20 || best.quality.garbledRatio > 0.08) {
        const fallback = await extractWithUnpdf(bytes);
        if (fallback) best = remember(best, fallback, "unpdf");
      }
      if (best && textLooksColumnJumbled(best.text)) {
        console.info(
          JSON.stringify({
            event: "resume_parse",
            visionTriggered: true,
            visionCalled: Boolean(getOpenAiApiKey()) && !control.aborted,
            shortLineShare: columnJumbleShare(best.text),
          }),
        );
      }
      if (best && textLooksColumnJumbled(best.text) && getOpenAiApiKey() && !control.aborted) {
        const shot = await parser
          .getScreenshot({ imageBuffer: true, imageDataUrl: false, scale: 1.5, first: OCR_MAX_PAGES })
          .catch(() => ({ pages: [] as Array<{ data?: Uint8Array }> }));
        const images = (shot.pages ?? [])
          .map((page) => page.data)
          .filter((data): data is Uint8Array => data instanceof Uint8Array && data.byteLength > 0)
          .slice(0, OCR_MAX_PAGES);
        const pages: string[] = [];
        const auditBase = hint.visionAudit ?? null;
        const optedOut =
          auditBase !== null && (await applicationOptedOutOfAi(auditBase.db, auditBase.applicationId));
        if (optedOut && auditBase) {
          await transcribeResumePage(images[0] ?? new Uint8Array(), {
            ...auditBase,
            pageCount: images.length,
            pageIndex: 0,
          });
        } else {
          for (let pageIndex = 0; pageIndex < images.length; pageIndex += 1) {
            if (control.aborted) break;
            const image = images[pageIndex];
            if (!image) continue;
            const visual = await transcribeResumePage(
              image,
              auditBase
                ? { ...auditBase, pageCount: images.length, pageIndex }
                : null,
            );
            if (visual) pages.push(visual);
          }
        }
        if (pages.length > 0) best = remember(best, pages.join("\n\n"), "vision");
      }
      if (!best) {
        const info = await parser.getInfo().catch(() => ({ total: 0 }));
        const pageCount = typeof info.total === "number" ? info.total : 0;
        if (pageCount > OCR_MAX_PAGES) {
          console.info(
            JSON.stringify({
              event: "resume_parse",
              kind: "pdf",
              ocrPagesTruncated: true,
              pageCount,
              ocrPageLimit: OCR_MAX_PAGES,
            }),
          );
        }
        if (hint.ocr !== "inline") {
          logParse({
            kind: "pdf",
            ok: false,
            errorCode: "OCR_DEFERRED",
            durationMs: Date.now() - started,
          });
          return { ok: false, errorCode: "OCR_DEFERRED" };
        }
        const ocrText = await ocrPdfScreenshots(parser, control, (worker) => {
          tess = worker;
        });
        if (ocrText) best = remember(best, ocrText, "tesseract");
      }
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.error("[resume-extraction] pdf parse failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    sawParserError = true;
    const fallback = await extractWithUnpdf(bytes);
    if (fallback) best = remember(best, fallback, "unpdf");
  }

  if (!best) {
    const errorCode = sawParserError ? "PDF_PARSE_FAILED" : "PDF_NO_TEXT_LAYER";
    logParse({ kind: "pdf", ok: false, errorCode, durationMs: Date.now() - started });
    return { ok: false, errorCode };
  }
  const chosen = best as { text: string; quality: ExtractionQuality; extractor: string };
  return withQuality(chosen.text, chosen.extractor);
}

async function extractWithUnpdf(bytes: Buffer): Promise<string | null> {
  try {
    const unpdf = await import("unpdf");
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(bytes));
    const result = await unpdf.extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    return typeof text === "string" && text.trim() ? text : null;
  } catch (error) {
    console.error("[resume-extraction] unpdf failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function ocrPdfScreenshots(
  parser: {
    getScreenshot(params?: {
      imageBuffer?: boolean;
      imageDataUrl?: boolean;
      scale?: number;
      first?: number;
    }): Promise<{ pages?: Array<{ data?: Uint8Array }> }>;
  },
  control: ParseControl,
  onWorker: (worker: { terminate: () => Promise<unknown> }) => void,
): Promise<string | null> {
  if (control.aborted) return null;
  try {
    const shot = await parser.getScreenshot({
      imageBuffer: true,
      imageDataUrl: false,
      scale: 2,
      first: OCR_MAX_PAGES,
    });
    if (control.aborted) return null;
    const pages = (shot.pages ?? [])
      .map((page) => page.data)
      .filter((data): data is Uint8Array => data instanceof Uint8Array && data.byteLength > 0)
      .slice(0, OCR_MAX_PAGES);
    if (pages.length === 0) return null;

    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker("eng");
    onWorker(worker);
    try {
      if (control.aborted) return null;
      const parts: string[] = [];
      for (const page of pages) {
        if (control.aborted) return parts.join("\n").trim() || null;
        const recognized = await worker.recognize(Buffer.from(page));
        const pageText = recognized.data.text?.trim();
        if (pageText) parts.push(pageText);
      }
      const combined = parts.join("\n").trim();
      return combined || null;
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    if (control.aborted) return null;
    console.error("[resume-extraction] pdf ocr failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function extractFromDocx(bytes: Buffer): Promise<ExtractionOutcome> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    const text = typeof result.value === "string" ? result.value : "";
    if (!text.trim()) {
      return { ok: false, errorCode: "DOCX_NO_TEXT" };
    }
    return withQuality(text, "mammoth");
  } catch {
    return { ok: false, errorCode: "DOCX_PARSE_FAILED" };
  }
}

function extractFromText(bytes: Buffer): ExtractionOutcome {
  const decoded = bytes.toString("utf8");
  const replacementRatio =
    (decoded.match(/\uFFFD/g) ?? []).length / Math.max(decoded.length, 1);
  if (replacementRatio > 0.05) {
    return { ok: false, errorCode: "BINARY_CONTENT_REJECTED" };
  }
  if (!decoded.trim()) {
    return { ok: false, errorCode: "EMPTY_DOCUMENT" };
  }
  return withQuality(decoded, "text");
}

function logParse(entry: {
  kind: string;
  ok: boolean;
  errorCode?: string;
  durationMs: number;
  extractor?: string;
  quality?: ExtractionQuality;
}) {
  console.info(
    JSON.stringify({
      event: "resume_parse",
      ...entry,
      score: entry.quality?.score ?? null,
      wordCount: entry.quality?.wordCount ?? null,
      needsReview: entry.quality?.needsReview ?? null,
      quality: undefined,
    }),
  );
}

async function extractResumeTextInner(
  bytes: Buffer,
  hint: ResumeFileHint,
  control: ParseControl,
): Promise<ExtractionOutcome> {
  const started = Date.now();
  const kind = sniffResumeKind(bytes, hint);
  let outcome: ExtractionOutcome;
  if (kind === "pdf") outcome = await extractFromPdf(bytes, hint, control);
  else if (kind === "docx") outcome = await extractFromDocx(bytes);
  else if (kind === "text") outcome = extractFromText(bytes);
  else if (kind === "legacy-doc") outcome = { ok: false, errorCode: "LEGACY_DOC_UNSUPPORTED" };
  else outcome = { ok: false, errorCode: "UNSUPPORTED_FORMAT" };

  if (kind !== "pdf") {
    logParse({
      kind,
      ok: outcome.ok,
      errorCode: outcome.ok ? undefined : outcome.errorCode,
      durationMs: Date.now() - started,
      extractor: outcome.ok ? outcome.extractor : undefined,
      quality: outcome.ok ? outcome.quality : undefined,
    });
  } else if (outcome.ok) {
    logParse({
      kind,
      ok: true,
      durationMs: Date.now() - started,
      extractor: outcome.extractor,
      quality: outcome.quality,
    });
  }
  return outcome;
}

export { offsetsOf, stripHiddenText } from "@/lib/resumes/hidden-text";

export async function extractResumeText(
  bytes: Buffer,
  hint: ResumeFileHint = {},
): Promise<ExtractionOutcome> {
  const control = createParseControl();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ExtractionOutcome>((resolve) => {
    timer = setTimeout(() => {
      control.stop();
      resolve({ ok: false, errorCode: "PARSE_TIMEOUT" });
    }, RESUME_PARSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([extractResumeTextInner(bytes, hint, control), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
