/**
 * Public app URL and Resend credentials from the environment.
 * Never hard-code localhost for production links.
 */
export function getPublicAppUrl() {
  const raw = process.env.APP_URL?.trim() || process.env.AUTH_URL?.trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getResendApiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? key : null;
}

export function getEmailFromAddress() {
  const from = process.env.EMAIL_FROM?.trim();
  return from ? from : null;
}

export function isEmailProviderConfigured() {
  return Boolean(getResendApiKey() && getEmailFromAddress());
}
