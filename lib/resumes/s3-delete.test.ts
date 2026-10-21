import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { S3ResumeStorage } from "@/lib/resumes/s3-driver";
import { deleteResume, deleteResumeObject } from "@/lib/resumes/storage";

const KEY = `${randomUUID()}/${randomUUID()}/${randomUUID()}.pdf`;
const saved = { ...process.env };

type Step = Response | Error;

/** Plays one scripted answer per request and records the methods used. */
function script(steps: Step[]) {
  const methods: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    methods.push(String(init?.method));
    const step = steps.shift();
    if (!step) throw new Error("unexpected extra request");
    if (step instanceof Error) throw step;
    return step;
  });
  return methods;
}

const res = (status: number) => new Response(status === 204 ? null : status === 404 ? "<Error/>" : "", { status });

describe("S3 delete results", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      RESUME_STORAGE_DRIVER: "S3",
      S3_BUCKET: "test-bucket",
      S3_REGION: "eu-test-1",
      S3_ACCESS_KEY_ID: "AKIATEST",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    delete process.env.S3_ENDPOINT;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...saved };
  });

  it("reports DELETED only after HEAD found the object and DELETE succeeded", async () => {
    const methods = script([res(200), res(204)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "DELETED" });
    expect(methods).toEqual(["HEAD", "DELETE"]);
  });

  it("reports ABSENT when HEAD says the object does not exist, without issuing a DELETE", async () => {
    const methods = script([res(404)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "ABSENT" });
    expect(methods).toEqual(["HEAD"]);
  });

  it("reports ABSENT when the object disappears between HEAD and DELETE", async () => {
    const methods = script([res(200), res(404)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "ABSENT" });
    expect(methods).toEqual(["HEAD", "DELETE"]);
  });

  it.each([401, 403])("a HEAD authentication failure (%i) is FAILED, never ABSENT, and nothing is deleted", async (status) => {
    const methods = script([res(status)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "FAILED", code: "STORAGE_DELETE_FAILED" });
    expect(methods).toEqual(["HEAD"]);
  });

  it.each([500, 503])("a HEAD server error (%i) is FAILED and retryable", async (status) => {
    const methods = script([res(status)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "FAILED", code: "STORAGE_DELETE_FAILED" });
    expect(methods).toEqual(["HEAD"]);
  });

  it("a DELETE permission failure is FAILED, not DELETED", async () => {
    script([res(200), res(403)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "FAILED", code: "STORAGE_DELETE_FAILED" });
  });

  it("a DELETE server error is FAILED", async () => {
    script([res(200), res(500)]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "FAILED", code: "STORAGE_DELETE_FAILED" });
  });

  it("a network timeout on HEAD is FAILED, never ABSENT", async () => {
    script([new DOMException("The operation timed out", "TimeoutError")]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "FAILED", code: "STORAGE_DELETE_FAILED" });
  });

  it("a network error on DELETE is FAILED, never DELETED", async () => {
    script([res(200), new TypeError("fetch failed")]);
    expect(await deleteResumeObject(KEY)).toEqual({ status: "FAILED", code: "STORAGE_DELETE_FAILED" });
  });

  it("a failure is retryable: the next attempt can delete the object", async () => {
    script([res(503)]);
    expect((await deleteResumeObject(KEY)).status).toBe("FAILED");
    script([res(200), res(204)]);
    expect((await deleteResumeObject(KEY)).status).toBe("DELETED");
  });

  it("deleteResume throws on FAILED, so a caller cannot treat it as success", async () => {
    script([res(403)]);
    await expect(deleteResume(KEY)).rejects.toMatchObject({ code: "STORAGE_DELETE_FAILED" });
  });

  it("the driver itself throws a typed error for a network failure instead of a raw one", async () => {
    script([new TypeError("fetch failed")]);
    await expect(new S3ResumeStorage().delete(KEY)).rejects.toMatchObject({ code: "STORAGE_DELETE_FAILED" });
  });

  it("an invalid key never reaches the provider", async () => {
    const methods = script([]);
    expect((await deleteResumeObject("../etc/passwd")).status).toBe("FAILED");
    expect(methods).toEqual([]);
  });
});
