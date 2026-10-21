import { describe, expect, it } from "vitest";

import { scanAttachment, setAttachmentScannerForTests } from "@/lib/inbound/attachment-scan";

describe("inbound malware scan boundary", () => {
  it("reports unavailable and does not claim a clean scan", async () => {
    setAttachmentScannerForTests(null);
    await expect(scanAttachment(Buffer.from("resume"))).resolves.toEqual({ status: "unavailable" });
  });

  it("uses an injected scanner result without a network client", async () => {
    setAttachmentScannerForTests({
      async scan() {
        return { status: "infected" };
      },
    });
    await expect(scanAttachment(Buffer.from("resume"))).resolves.toEqual({ status: "infected" });
    setAttachmentScannerForTests(null);
  });
});
