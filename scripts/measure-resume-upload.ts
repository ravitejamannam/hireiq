/**
 * Time the synchronous upload path: store the file, insert PARSING, return.
 * Background parsing is not included.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { storePendingHostedResume } from "@/lib/apply/hosted-resume-service";

function loadEnvFile() {
  const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  process.env.HIREIQ_SKIP_RESUME_PARSE = "1";
  loadEnvFile();
  const existing = await prisma.applyToken.findFirst({ select: { id: true, tokenHash: true, revokedAt: true } });
  if (!existing) throw new Error("No apply token to borrow for the latency check.");
  const token = generateSecureToken();
  await prisma.applyToken.update({
    where: { id: existing.id },
    data: { tokenHash: token.tokenHash, revokedAt: null },
  });
  const row = existing;
  const times: number[] = [];
  const bytes = Buffer.from("Ada Lovelace\nEngineer at Analytical Engines\n");
  try {
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const result = await storePendingHostedResume({
        applyTokenRaw: token.rawToken,
        fileName: `latency-${index}.txt`,
        contentType: "text/plain",
        bytes,
      });
      times.push(performance.now() - started);
      if (result.parseStatus !== "PARSING") throw new Error(`expected PARSING, got ${result.parseStatus}`);
    }
  } finally {
    await prisma.hostedApplyResumeUpload.deleteMany({ where: { applyTokenHash: hashSecureToken(token.rawToken) } });
    await prisma.applyToken.update({
      where: { id: row.id },
      data: { tokenHash: row.tokenHash, revokedAt: row.revokedAt },
    });
    await prisma.$disconnect();
  }
  times.sort((left, right) => left - right);
  const p95 = times[Math.ceil(times.length * 0.95) - 1] ?? 0;
  console.log(JSON.stringify({
    n: times.length,
    p50ms: Math.round(times[Math.floor(times.length / 2)] ?? 0),
    p95ms: Math.round(p95),
    maxMs: Math.round(times[times.length - 1] ?? 0),
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
