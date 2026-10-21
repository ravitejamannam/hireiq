import { createSign } from "node:crypto";

export type IndexingNotificationKind = "URL_UPDATED" | "URL_DELETED";

export type IndexingConfig =
  | { configured: false; reason: "DISABLED" | "MISSING_CREDENTIALS" }
  | { configured: true; clientEmail: string; privateKey: string };

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";

export function readIndexingConfig(
  env: NodeJS.ProcessEnv = process.env,
): IndexingConfig {
  if (env.GOOGLE_INDEXING_ENABLED !== "true") {
    return { configured: false, reason: "DISABLED" };
  }
  const clientEmail = env.GOOGLE_INDEXING_CLIENT_EMAIL?.trim() ?? "";
  const privateKey = (env.GOOGLE_INDEXING_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey.includes("PRIVATE KEY")) {
    return { configured: false, reason: "MISSING_CREDENTIALS" };
  }
  return { configured: true, clientEmail, privateKey };
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function signIndexingJwt(clientEmail: string, privateKey: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: INDEXING_SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey, "base64url")}`;
}

export type IndexingSendResult = {
  status: "SUBMITTED" | "FAILED" | "UNCONFIGURED";
  httpStatus: number | null;
  errorCode: string | null;
};

/**
 * Notifies Google when credentials are configured.
 * UNCONFIGURED and FAILED do not mean the job page changed publication state.
 * SUBMITTED means the Indexing API accepted the call, not that the URL is indexed.
 */
export async function sendIndexingNotification(input: {
  url: string;
  type: IndexingNotificationKind;
  config?: IndexingConfig;
  fetchImpl?: typeof fetch;
}): Promise<IndexingSendResult> {
  const config = input.config ?? readIndexingConfig();
  if (!config.configured) {
    return {
      status: "UNCONFIGURED",
      httpStatus: null,
      errorCode: config.reason,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { status: "FAILED", httpStatus: null, errorCode: "URL_INVALID" };
  }
  if (parsed.protocol !== "https:") {
    return { status: "FAILED", httpStatus: null, errorCode: "URL_NOT_HTTPS" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let assertion: string;
  try {
    assertion = signIndexingJwt(config.clientEmail, config.privateKey);
  } catch {
    return { status: "FAILED", httpStatus: null, errorCode: "SIGNING_FAILED" };
  }

  let accessToken: string;
  try {
    const tokenResponse = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!tokenResponse.ok) {
      return {
        status: "FAILED",
        httpStatus: tokenResponse.status,
        errorCode: "TOKEN_REJECTED",
      };
    }
    const tokenBody = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof tokenBody.access_token !== "string" || !tokenBody.access_token) {
      return { status: "FAILED", httpStatus: tokenResponse.status, errorCode: "TOKEN_MISSING" };
    }
    accessToken = tokenBody.access_token;
  } catch {
    return { status: "FAILED", httpStatus: null, errorCode: "TOKEN_UNREACHABLE" };
  }

  try {
    const response = await fetchImpl(PUBLISH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: parsed.toString(), type: input.type }),
    });
    if (!response.ok) {
      return {
        status: "FAILED",
        httpStatus: response.status,
        errorCode: "PUBLISH_REJECTED",
      };
    }
    return { status: "SUBMITTED", httpStatus: response.status, errorCode: null };
  } catch {
    return { status: "FAILED", httpStatus: null, errorCode: "PUBLISH_UNREACHABLE" };
  }
}
