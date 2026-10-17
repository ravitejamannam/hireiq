import { deleteResume } from "@/lib/resumes/storage";

/**
 * The database write for a newly stored resume failed.
 * Delete only that new key, then rethrow the original error.
 */
export async function abandonNewResumeObject(
  storageKey: string,
  error: unknown,
  remove: (key: string) => Promise<void> = deleteResume,
): Promise<never> {
  try {
    await remove(storageKey);
  } catch (cleanupError) {
    console.error("[resume-storage] failed to delete new resume object", {
      storageKey,
      cause:
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }
  throw error;
}

/**
 * Extraction and the database write both happen before the row owns the file.
 * A throw from either deletes only the new key. Work after this function
 * returns cannot delete it.
 */
export async function persistAfterResumeExtract<Extraction, Persisted>(input: {
  storageKey: string;
  extract: () => Promise<Extraction>;
  persist: (extraction: Extraction) => Promise<Persisted>;
  remove?: (key: string) => Promise<void>;
}): Promise<Persisted> {
  let extraction: Extraction;
  try {
    extraction = await input.extract();
  } catch (error) {
    await abandonNewResumeObject(input.storageKey, error, input.remove);
    throw error;
  }
  try {
    return await input.persist(extraction);
  } catch (error) {
    await abandonNewResumeObject(input.storageKey, error, input.remove);
    throw error;
  }
}

/**
 * Delete a key that a successful replacement no longer references.
 * A shared key, the key the row now owns, or a delete failure leaves the file.
 */
export async function releaseReplacedResumeObject(input: {
  previousKey: string;
  currentKey: string;
  stillReferenced: (key: string) => Promise<boolean>;
  remove?: (key: string) => Promise<void>;
}): Promise<void> {
  if (input.previousKey === input.currentKey) return;
  if (await input.stillReferenced(input.previousKey)) return;
  const remove = input.remove ?? deleteResume;
  try {
    await remove(input.previousKey);
  } catch (cleanupError) {
    console.error("[resume-storage] failed to delete replaced resume object", {
      storageKey: input.previousKey,
      cause:
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }
}

/** The new object was not attached to a row. Cleanup failure must not hide that. */
export async function discardUnattachedResumeObject(
  storageKey: string,
  remove: (key: string) => Promise<void> = deleteResume,
): Promise<void> {
  try {
    await remove(storageKey);
  } catch (cleanupError) {
    console.error("[resume-storage] failed to discard unattached resume object", {
      storageKey,
      cause:
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }
}
