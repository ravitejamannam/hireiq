import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { S3ResumeStorage } from "@/lib/resumes/s3-driver";
import {
  ResumeStorageError,
  type ResumeStorageDriver,
  type StorageDeleteResult,
  type StorageDeleteStatus,
  type StoredResume,
} from "@/lib/resumes/storage-types";

export type { ResumeStorageDriver, StoredResume };
export { ResumeStorageError };

/**
 * Resume binary storage (T97 / constitution §29).
 *
 * LOCAL writes under `.data/resumes/` (gitignored).
 * S3 uses AWS SigV4 against S3/R2/MinIO when RESUME_STORAGE_DRIVER=S3.
 *
 * Keys are opaque UUIDs — user-supplied file names never touch the path.
 */

const STORAGE_KEY_RE =
  /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{2,10}$/;

class LocalResumeStorage implements ResumeStorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!STORAGE_KEY_RE.test(key)) {
      throw new ResumeStorageError("INVALID_STORAGE_KEY");
    }
    return path.join(this.root, key);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<StorageDeleteStatus> {
    const full = this.resolve(key);
    try {
      await rm(full);
      return "DELETED";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "ABSENT";
      throw new ResumeStorageError("STORAGE_DELETE_FAILED");
    }
  }
}

const localRoot = process.env.RESUME_STORAGE_DIR?.trim() || ".data/resumes";
const localDriver = new LocalResumeStorage(localRoot);
const s3Driver = new S3ResumeStorage();

function activeDriver(): ResumeStorageDriver {
  const configured = (process.env.RESUME_STORAGE_DRIVER ?? "LOCAL")
    .trim()
    .toUpperCase();
  if (configured === "LOCAL") {
    return localDriver;
  }
  if (configured === "S3") {
    return s3Driver;
  }
  throw new ResumeStorageError("STORAGE_DRIVER_UNAVAILABLE");
}

export function buildResumeStorageKey(
  companyId: number,
  candidateId: number,
  extension: string,
): string {
  void companyId;
  void candidateId;
  return `${randomUUID()}/${randomUUID()}/${randomUUID()}.${extension}`;
}

export async function storeResume(
  key: string,
  bytes: Buffer,
): Promise<StoredResume> {
  await activeDriver().put(key, bytes);
  return {
    storageKey: key,
    sizeBytes: bytes.byteLength,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readResume(key: string): Promise<Buffer | null> {
  return activeDriver().get(key);
}

/** Observable delete. A provider failure is returned as FAILED and is never reported as deleted or absent. */
export async function deleteResumeObject(key: string): Promise<StorageDeleteResult> {
  try {
    return { status: await activeDriver().delete(key) };
  } catch (error) {
    return { status: "FAILED", code: error instanceof ResumeStorageError ? error.code : "STORAGE_DELETE_FAILED" };
  }
}

/** Throws when the provider reports a failure. */
export async function deleteResume(key: string): Promise<void> {
  const result = await deleteResumeObject(key);
  if (result.status === "FAILED") throw new ResumeStorageError(result.code);
}
