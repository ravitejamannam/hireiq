import { describe, expect, it } from "vitest";

import { applyTestEnvFile } from "@/lib/evidence-graph/evidence-graph-test-env";

function enoent(): Error {
  const error = new Error("missing");
  Object.assign(error, { code: "ENOENT" });
  return error;
}

describe("integration test environment loading", () => {
  it("does not replace an explicit DATABASE_URL", () => {
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "postgresql://explicit/hireiq_test",
    };

    applyTestEnvFile({
      env,
      envPath: ".env",
      readFile: () => 'DATABASE_URL="postgresql://from-file/hireiq"\n',
    });

    expect(env.DATABASE_URL).toBe("postgresql://explicit/hireiq_test");
  });

  it("ignores a missing .env file", () => {
    const env: Record<string, string | undefined> = {};

    applyTestEnvFile({
      env,
      envPath: ".env",
      readFile: () => {
        throw enoent();
      },
    });

    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("loads a local .env when DATABASE_URL is unset", () => {
    const env: Record<string, string | undefined> = {};

    applyTestEnvFile({
      env,
      envPath: ".env",
      readFile: () => 'DATABASE_URL="postgresql://from-file/hireiq_test"\n',
    });

    expect(env.DATABASE_URL).toBe("postgresql://from-file/hireiq_test");
  });
});