"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getLexicalRetrieval as loadLexicalRetrieval,
  isLexicalRetrievalActionError,
  lexicalRetrievalActionErrorMessage,
  runLexicalRetrievalForAdmin,
} from "@/lib/retrieval/lexical-retrieval-service";

export async function getLexicalRetrieval(jobId: unknown) {
  return loadLexicalRetrieval(jobId);
}

export async function runLexicalRetrieval(
  jobId: unknown,
  jobSpecificationVersionId: unknown,
  limit?: unknown,
) {
  try {
    const run = await runLexicalRetrievalForAdmin(
      jobId,
      jobSpecificationVersionId,
      limit,
    );
    revalidatePath(`/dashboard/requirements/${run.jobId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isLexicalRetrievalActionError(error)) {
      return {
        ok: false as const,
        error: lexicalRetrievalActionErrorMessage(error),
      };
    }
    throw error;
  }
}
