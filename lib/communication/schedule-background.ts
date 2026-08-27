import { after } from "next/server";

/**
 * Run work after the response is sent when a Next.js request is active.
 * Falls back to fire-and-forget outside a request (scripts, cron).
 */
export function scheduleBackgroundWork(work: () => Promise<void>): void {
  const run = () => {
    void work().catch((error) => {
      console.error("[background-work] failed", error);
    });
  };

  try {
    after(run);
  } catch {
    run();
  }
}
