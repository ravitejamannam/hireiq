import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

/**
 * Resume binary storage (T97 / constitution §29).
 *
 * Binaries live outside PostgreSQL. The LOCAL driver persists under
 * `.data/resumes/` (gitignored) with non-guessable keys; the interface is
 * the seam for an S3-compatible driver when a ticket asks for it.
 *
 * Keys are opaque UUIDs — user-supplied file names never touch the path.
 */

export class ResumeStorageError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type StoredResume = {
  storageKey: string;
  sizeBytes: number;
  contentSha256: string;
};

export interface ResumeStorageDriver {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

class LocalResumeStorage implements ResumeStorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(key: string): string {
    // Defense in depth: key shape is system-generated, but reject anything
    // that could escape the root even if a future caller misuses the API.
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{2,10}$/.test(key)) {
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

  async delete(key: string): Promise<void> {
    try {
      await rm(this.resolve(key));
    } catch {
      // deleting a missing object is a no-op
    }
  }
}

const localRoot = process.env.RESUME_STORAGE_DIR?.trim() || ".data/resumes";

const drivers = {
  LOCAL: new LocalResumeStorage(localRoot),
} as const;

type StorageDriverName = keyof typeof drivers;

function activeDriver(): ResumeStorageDriver {
  const configured = (process.env.RESUME_STORAGE_DRIVER ?? "LOCAL") as StorageDriverName;
  const driver = drivers[configured];
  if (!driver) {
    throw new ResumeStorageError("STORAGE_DRIVER_UNAVAILABLE");
  }
  return driver;
}

export function buildResumeStorageKey(companyId: number, candidateId: number, extension: string): string {
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

export async function deleteResume(key: string): Promise<void> {
  return activeDriver().delete(key);
}
