import { describe, expect, it } from "vitest";

import { signWebhookBody } from "@/lib/api/partner-webhook";
import { inspectAttachment, selectResumeAttachment } from "@/lib/inbound/attachment";
import { inboundSignatureMatches, parseInboundEvent, recipientTokenHash } from "@/lib/inbound/contract";

describe("inbound email contract", () => {
  it("rejects a bad signature, a stale timestamp, and a malformed payload", () => {
    const body = JSON.stringify({ eventId: "e1", recipient: "token@inbound.test" });
    const timestamp = new Date().toISOString();
    const signature = `sha256=${signWebhookBody("secret", timestamp, body)}`;
    expect(inboundSignatureMatches({ secret: "secret", timestamp, body, signature })).toBe(true);
    expect(inboundSignatureMatches({ secret: "other", timestamp, body, signature })).toBe(false);
    expect(inboundSignatureMatches({ secret: "secret", timestamp: "2020-01-01T00:00:00.000Z", body, signature })).toBe(false);
    expect(parseInboundEvent("{").ok).toBe(false);
    expect(parseInboundEvent(JSON.stringify({ eventId: "", recipient: "a@b.test" })).ok).toBe(false);
  });

  it("binds the recipient token to the configured domain", () => {
    expect(recipientTokenHash("abc@inbound.test", "inbound.test")).toBeTruthy();
    expect(recipientTokenHash("abc@other.test", "inbound.test")).toBeNull();
    const parsed = parseInboundEvent(JSON.stringify({ eventId: "e1", recipient: "AbC@inbound.test" }));
    expect(parsed.ok && parsed.event.recipient).toBe("AbC@inbound.test");
    expect(recipientTokenHash("not-an-address", "inbound.test")).toBeNull();
  });
});

describe("inbound attachments", () => {
  it("rejects malformed, oversized, and unsupported files", () => {
    expect(inspectAttachment({ fileName: "resume.pdf", bytes: Buffer.from("not a pdf") }).ok).toBe(false);
    expect(inspectAttachment({ fileName: "run.exe", bytes: Buffer.from("MZ") }).ok).toBe(false);
    expect(inspectAttachment({ fileName: "note.txt", bytes: Buffer.from([0x61, 0]) }).ok).toBe(false);
    expect(inspectAttachment({ fileName: "big.txt", bytes: Buffer.alloc(2 * 1024 * 1024 + 1, 65) }).ok).toBe(false);
    expect(inspectAttachment({ fileName: "resume.txt", bytes: Buffer.from("Ada Lovelace") }).ok).toBe(true);
  });

  it("keeps the first valid resume when several attachments arrive", () => {
    const selected = selectResumeAttachment([
      { fileName: "notes.html", bytes: Buffer.from("<html>") },
      { fileName: "resume.txt", bytes: Buffer.from("resume") },
      { fileName: "also.txt", bytes: Buffer.from("second") },
    ]);
    expect(selected.chosen?.fileName).toBe("resume.txt");
    expect(selected.extra).toBe(1);
  });

  it("reports a missing resume separately from a rejected file", () => {
    expect(selectResumeAttachment([]).chosen).toBeNull();
    expect(selectResumeAttachment([{ fileName: "x.exe", bytes: Buffer.from("MZ") }]).code).toBe("UNSUPPORTED_FILE_TYPE");
  });
});
