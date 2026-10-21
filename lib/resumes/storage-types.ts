export class ResumeStorageError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type StorageDeleteStatus = "DELETED" | "ABSENT";

export type StorageDeleteResult =
  | { status: StorageDeleteStatus }
  | { status: "FAILED"; code: string };

export type StoredResume = {
  storageKey: string;
  sizeBytes: number;
  contentSha256: string;
};

export interface ResumeStorageDriver {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /**
   * DELETED: this call removed an object that existed.
   * ABSENT: nothing was stored under the key.
   * A provider failure throws ResumeStorageError("STORAGE_DELETE_FAILED"). It is never reported as either status.
   */
  delete(key: string): Promise<StorageDeleteStatus>;
}
