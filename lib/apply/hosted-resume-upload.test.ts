import { describe, expect, it, vi } from "vitest";

import { finishHostedResumeUpload } from "@/lib/apply/hosted-resume-service";

describe("hosted resume upload ownership", () => {
  it("does not delete the object when suggestion generation throws after insert", async () => {
    const removed: string[] = [];
    let inserted = false;
    const suggestionError = new Error("suggestion failed");
    await expect(
      finishHostedResumeUpload({
        storageKey: "new-key",
        insert: async () => {
          inserted = true;
        },
        suggest: async () => {
          throw suggestionError;
        },
        remove: async (key) => {
          removed.push(key);
        },
      }),
    ).rejects.toBe(suggestionError);
    expect(inserted).toBe(true);
    expect(removed).toEqual([]);
  });

  it("deletes only the new key when the insert fails", async () => {
    const removed: string[] = [];
    const insertError = new Error("insert failed");
    await expect(
      finishHostedResumeUpload({
        storageKey: "new-key",
        insert: async () => {
          throw insertError;
        },
        suggest: async () => {
          throw new Error("suggestion should not run");
        },
        remove: async (key) => {
          removed.push(key);
        },
      }),
    ).rejects.toBe(insertError);
    expect(removed).toEqual(["new-key"]);
  });

  it("does not delete when the insert and suggestion both succeed", async () => {
    const remove = vi.fn(async () => undefined);
    const result = await finishHostedResumeUpload({
      storageKey: "new-key",
      insert: async () => undefined,
      suggest: async () => ({ resumeClaim: "claim" }),
      remove,
    });
    expect(result).toEqual({ resumeClaim: "claim" });
    expect(remove).not.toHaveBeenCalled();
  });
});
