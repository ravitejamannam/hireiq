import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;

export const CREDENTIAL_ENCRYPTION_NOT_CONFIGURED =
  "Credential encryption is not configured.";
export const CREDENTIAL_ENCRYPTION_KEY_INVALID =
  "Credential encryption key is invalid.";
export const CREDENTIAL_CIPHERTEXT_INVALID =
  "Stored credential material is invalid.";

export class CredentialEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialEncryptionError";
  }
}

/**
 * AES-256-GCM master key from HIREIQ_CREDENTIAL_ENCRYPTION_KEY.
 * Accepts 64-char hex or base64 that decodes to 32 bytes.
 * Never log the key or plaintext.
 */
export function readCredentialEncryptionKey() {
  const raw = process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new CredentialEncryptionError(CREDENTIAL_ENCRYPTION_NOT_CONFIGURED);
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === KEY_BYTES) {
      return decoded;
    }
  } catch {
    throw new CredentialEncryptionError(CREDENTIAL_ENCRYPTION_KEY_INVALID);
  }

  throw new CredentialEncryptionError(CREDENTIAL_ENCRYPTION_KEY_INVALID);
}

export function isCredentialEncryptionConfigured() {
  try {
    readCredentialEncryptionKey();
    return true;
  } catch (error) {
    if (error instanceof CredentialEncryptionError) {
      return false;
    }
    throw error;
  }
}

/**
 * Authenticated encryption for tenant provider secrets.
 * Format: v1.<iv>.<ciphertext>.<tag> (base64url parts).
 */
export function encryptCredentialSecret(plaintext: string) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new CredentialEncryptionError("Credential secret is required.");
  }

  const key = readCredentialEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  if (tag.length !== AUTH_TAG_BYTES) {
    throw new CredentialEncryptionError(CREDENTIAL_ENCRYPTION_KEY_INVALID);
  }

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptCredentialSecret(payload: string) {
  if (typeof payload !== "string" || !payload) {
    throw new CredentialEncryptionError(CREDENTIAL_CIPHERTEXT_INVALID);
  }

  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CredentialEncryptionError(CREDENTIAL_CIPHERTEXT_INVALID);
  }

  const key = readCredentialEncryptionKey();
  const iv = Buffer.from(parts[1], "base64url");
  const ciphertext = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");

  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new CredentialEncryptionError(CREDENTIAL_CIPHERTEXT_INVALID);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
