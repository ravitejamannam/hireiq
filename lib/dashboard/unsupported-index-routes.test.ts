import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: () => {
    throw new Error("REDIRECT");
  },
}));

describe("unsupported admin index routes", () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it.each([
    ["interviews", "@/app/dashboard/interviews/page"],
    ["reports", "@/app/dashboard/reports/page"],
    ["coding tests", "@/app/dashboard/coding-tests/page"],
  ])("%s returns not found instead of redirecting", async (_label, specifier) => {
    const page = await import(specifier);
    expect(() => page.default()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
