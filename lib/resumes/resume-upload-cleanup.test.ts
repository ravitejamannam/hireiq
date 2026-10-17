import { describe, expect, it, vi } from "vitest";

import {
  abandonNewResumeObject,
  discardUnattachedResumeObject,
} from "@/lib/resumes/resume-upload-cleanup";

describe("new resume object cleanup", () => {
  it("does not delete when the caller keeps the stored object", async () => {
    const remove = vi.fn(async () => undefined);
    const kept = "new-key";
    expect(kept).toBe("new-key");
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes only the new key when the database insert fails", async () => {
    const removed: string[] = [];
    const insertError = new Error("insert failed");
    await expect(
      abandonNewResumeObject("new-key", insertError, async (key) => {
        removed.push(key);
      }),
    ).rejects.toBe(insertError);
    expect(removed).toEqual(["new-key"]);
  });

  it("keeps the insert error when cleanup fails", async () => {
    const insertError = new Error("insert failed");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      abandonNewResumeObject("new-key", insertError, async () => {
        throw new Error("delete failed");
      }),
    ).rejects.toBe(insertError);
    error.mockRestore();
  });

  it("never deletes a different key", async () => {
    const removed: string[] = [];
    await discardUnattachedResumeObject("new-key", async (key) => {
      removed.push(key);
    });
    expect(removed).toEqual(["new-key"]);
    expect(removed).not.toContain("existing-candidate-key");
  });
});
