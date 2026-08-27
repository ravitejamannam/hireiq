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
