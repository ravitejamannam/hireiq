import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/review/ReviewQueue.test.tsx"],
    setupFiles: ["./lib/testing/vitest-database-guard.ts"],
    server: {
      deps: {
        // next-auth imports "next/server" without an extension, which Node's ESM resolver rejects.
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
