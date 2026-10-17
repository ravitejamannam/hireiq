import { describe, expect, it, vi } from "vitest";

import {
  persistAfterResumeExtract,
  releaseReplacedResumeObject,
} from "@/lib/resumes/resume-upload-cleanup";

const EXISTING_KEY = "existing-candidate-key";

describe("admin resume extract-then-persist", () => {
  it("deletes only the new key when extraction throws", async () => {
    const removed: string[] = [];
    const extractionError = new Error("extract failed");
    await expect(
      persistAfterResumeExtract({
        storageKey: "new-key",
        extract: async () => {
          throw extractionError;
        },
        persist: async () => {
          throw new Error("persist should not run");
        },
        remove: async (key) => {
          removed.push(key);
        },
      }),
    ).rejects.toBe(extractionError);
    expect(removed).toEqual(["new-key"]);
    expect(removed).not.toContain(EXISTING_KEY);
  });

  it("keeps the extraction error when cleanup fails", async () => {
    const extractionError = new Error("extract failed");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      persistAfterResumeExtract({
        storageKey: "new-key",
        extract: async () => {
          throw extractionError;
        },
        persist: async () => "saved",
        remove: async () => {
          throw new Error("delete failed");
        },
      }),
    ).rejects.toBe(extractionError);
    error.mockRestore();
  });

  it("does not delete when extraction and the database write succeed", async () => {
    const remove = vi.fn(async () => undefined);
    const saved = await persistAfterResumeExtract({
      storageKey: "new-key",
      extract: async () => "text",
      persist: async (text) => ({ id: 1, text, storageKey: "new-key" }),
      remove,
    });
    expect(saved).toEqual({ id: 1, text: "text", storageKey: "new-key" });
    expect(remove).not.toHaveBeenCalled();
    await expect(Promise.reject(new Error("evidence failed"))).rejects.toThrow("evidence failed");
    expect(remove).not.toHaveBeenCalled();
  });

  it("cleans up the new key when the replacement write fails and leaves the old key", async () => {
    const removed: string[] = [];
    const writeError = new Error("update failed");
    await expect(
      persistAfterResumeExtract({
        storageKey: "new-key",
        extract: async () => "text",
        persist: async () => {
          throw writeError;
        },
        remove: async (key) => {
          removed.push(key);
        },
      }),
    ).rejects.toBe(writeError);
    expect(removed).toEqual(["new-key"]);
    expect(removed).not.toContain(EXISTING_KEY);
  });

  it("deletes an unreferenced replaced key and keeps the new key", async () => {
    const removed: string[] = [];
    await releaseReplacedResumeObject({
      previousKey: EXISTING_KEY,
      currentKey: "new-key",
      stillReferenced: async () => false,
      remove: async (key) => {
        removed.push(key);
      },
    });
    expect(removed).toEqual([EXISTING_KEY]);
    await expect(Promise.reject(new Error("evidence failed"))).rejects.toThrow("evidence failed");
    expect(removed).toEqual([EXISTING_KEY]);
  });

  it("does not delete a replaced key that another row still references", async () => {
    const remove = vi.fn(async () => undefined);
    await releaseReplacedResumeObject({
      previousKey: EXISTING_KEY,
      currentKey: "new-key",
      stillReferenced: async (key) => key === EXISTING_KEY,
      remove,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not delete an existing document key when the new upload is kept", async () => {
    const removed: string[] = [];
    const saved = await persistAfterResumeExtract({
      storageKey: "new-key",
      extract: async () => "text",
      persist: async () => ({ storageKey: "new-key", previousKey: EXISTING_KEY }),
      remove: async (key) => {
        removed.push(key);
      },
    });
    expect(saved.previousKey).toBe(EXISTING_KEY);
    expect(removed).toEqual([]);
  });
});
