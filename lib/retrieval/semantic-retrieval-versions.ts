import {
  DEFAULT_LEXICAL_RETRIEVAL_LIMIT,
  MAX_LEXICAL_RETRIEVAL_LIMIT,
  MIN_LEXICAL_RETRIEVAL_LIMIT,
} from "@/lib/retrieval/lexical-retrieval-versions";

export const SEMANTIC_RETRIEVAL_VERSION = "v1-semantic-embedding";
export const SEMANTIC_RETRIEVAL_METHOD = "semantic-max-evidence-cosine";
export const SEMANTIC_REPRESENTATION_VERSION = "v1-structured-query-evidence-text";
export const SEMANTIC_NORMALIZATION_VERSION = "v1-redact-and-trim";
export const SEMANTIC_QUERY_CONSTRUCTION_VERSION = "v1-structured-requirements";

export const DEFAULT_SEMANTIC_RETRIEVAL_LIMIT = DEFAULT_LEXICAL_RETRIEVAL_LIMIT;
export const MAX_SEMANTIC_RETRIEVAL_LIMIT = MAX_LEXICAL_RETRIEVAL_LIMIT;
export const MIN_SEMANTIC_RETRIEVAL_LIMIT = MIN_LEXICAL_RETRIEVAL_LIMIT;

export const STALE_SEMANTIC_RETRIEVAL_RUNNING_MS = 60_000;

export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_OPENAI_EMBEDDING_VERSION = "text-embedding-3-small";
export const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = 1536;

export const OFFLINE_EMBEDDING_PROVIDER = "offline";
export const OFFLINE_EMBEDDING_MODEL = "hash-projection-v1";
export const OFFLINE_EMBEDDING_VERSION = "v1";
export const OFFLINE_EMBEDDING_DIMENSIONS = 32;
