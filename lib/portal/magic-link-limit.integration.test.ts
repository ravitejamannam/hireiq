import { describe, expect, it } from "vitest";

import { RateLimitError, consumeAuthRateLimit, rateLimitKeyForEmail, rateLimitKeyForIp } from "@/lib/auth/rate-limit";

describe("magic link rate limit", () => {
  it("stops the sixth request for one email inside the hour", async () => {
    const email = `limit-${Date.now()}@hireiq.test`;
    const ip = `203.0.113.${Date.now() % 200}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await consumeAuthRateLimit({ name: "portalMagicLinkEmail", key: rateLimitKeyForEmail(email) });
      await consumeAuthRateLimit({ name: "portalMagicLinkIp", key: rateLimitKeyForIp(ip) });
    }
    await expect(
      consumeAuthRateLimit({ name: "portalMagicLinkEmail", key: rateLimitKeyForEmail(email) }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
