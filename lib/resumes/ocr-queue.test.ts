import { describe, expect, it } from "vitest";

import { ocrFailureCode, OCR_MAX_ATTEMPTS } from "@/lib/resumes/ocr-queue";

describe("ocrFailureCode", () => {
  it("sends a failed scan back to the queue until the attempt limit", () => {
    expect(ocrFailureCode(1)).toBe("OCR_DEFERRED");
    expect(ocrFailureCode(OCR_MAX_ATTEMPTS - 1)).toBe("OCR_DEFERRED");
  });

  it("stops retrying after the third claim", () => {
    expect(ocrFailureCode(OCR_MAX_ATTEMPTS)).toBe("OCR_EXHAUSTED");
  });
});
