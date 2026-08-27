import { createHash, createHmac } from "node:crypto";

import { ResumeStorageError, type ResumeStorageDriver } from "@/lib/resumes/storage-types";

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO).
 * SigV4 over fetch — no SDK dependency.
 */

const STORAGE_KEY_RE =
  /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{2,10}$/;

type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
};

function requireConfig(): S3Config {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new ResumeStorageError("STORAGE_DRIVER_UNAVAILABLE");
  }
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.S3_ENDPOINT?.trim() || null,
  };
}

function assertKey(key: string) {
  if (!STORAGE_KEY_RE.test(key)) {
    throw new ResumeStorageError("INVALID_STORAGE_KEY");
  }
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

function amzDate(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso.slice(0, 15) + "Z", date: iso.slice(0, 8) };
}

async function signedFetch(input: {
  method: "PUT" | "GET" | "DELETE";
  key: string;
  body?: Buffer;
}): Promise<Response> {
  const config = requireConfig();
  const { amz, date } = amzDate(new Date());
  const encodedKey = input.key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const host = config.endpoint
    ? new URL(config.endpoint).host
    : `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const path = config.endpoint
    ? `/${config.bucket}/${encodedKey}`
    : `/${encodedKey}`;
  const url = config.endpoint
    ? `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/${encodedKey}`
    : `https://${host}/${encodedKey}`;

  const payloadHash = input.body ? sha256Hex(input.body) : sha256Hex("");
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (input.body) {
    headers["content-length"] = String(input.body.byteLength);
    headers["content-type"] = "application/octet-stream";
  }

  const signedHeaderNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    input.method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${config.secretAccessKey}`, date);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method: input.method,
    headers,
    body: input.body ? new Uint8Array(input.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
}

export class S3ResumeStorage implements ResumeStorageDriver {
  async put(key: string, bytes: Buffer): Promise<void> {
    assertKey(key);
    const response = await signedFetch({ method: "PUT", key, body: bytes });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      console.error("[s3] put failed", response.status, detail);
      throw new ResumeStorageError("STORAGE_PUT_FAILED");
    }
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    const response = await signedFetch({ method: "GET", key });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      console.error("[s3] get failed", response.status);
      throw new ResumeStorageError("STORAGE_GET_FAILED");
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const response = await signedFetch({ method: "DELETE", key });
    if (response.status === 404 || response.ok) {
      return;
    }
    console.error("[s3] delete failed", response.status);
    throw new ResumeStorageError("STORAGE_DELETE_FAILED");
  }
}
