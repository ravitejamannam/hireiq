import { createHmac } from "node:crypto";

import { hashSecureToken } from "@/lib/auth/secure-token";
import { getPublicAppUrl } from "@/lib/communication/email-config";
import { HOSTED_APPLY_APP_URL_REQUIRED } from "@/lib/apply/hosted-apply-errors";
import {
  ASSESSMENT_INVITE_SECRET_REQUIRED,
  AssessmentError,
} from "@/lib/assessments/assessment-errors";

function requireInviteSecret() {
  // Audit fix (critical): the previous APP_URL fallback signed invites
  // with a PUBLIC value when AUTH_SECRET was unset — anyone could forge
  // invite URLs for any applicationId. Fail closed instead.
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new AssessmentError(ASSESSMENT_INVITE_SECRET_REQUIRED, "UNAVAILABLE");
  }
  return secret;
}

export function mintAssessmentInviteToken(applicationId: number) {
  const rawToken = createHmac("sha256", requireInviteSecret())
    .update(`assessment-invite:${applicationId}`)
    .digest("base64url");

  return {
    rawToken,
    tokenHash: hashSecureToken(rawToken),
  };
}

export function buildAssessmentUrl(rawToken: string) {
  const origin = getPublicAppUrl();
  if (!origin) {
    throw new AssessmentError(HOSTED_APPLY_APP_URL_REQUIRED, "UNAVAILABLE");
  }

  return `${origin}/assess/${rawToken}`;
}
