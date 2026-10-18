import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";

import { assertSsoIdentity, type SsoConnection } from "@/lib/auth/sso";

/**
 * SAML responses are verified by @node-saml/node-saml.
 * HireIQ does not parse or trust a signature flag of its own.
 * Assertions must be signed. A wrapping attack that moves a valid signature
 * onto a different assertion fails inside that library.
 */
export async function validateSamlLogin(input: {
  samlResponse: string;
  connection: SsoConnection;
  idpCert: string;
  audience: string;
  callbackUrl: string;
}) {
  if (input.connection.protocol !== "SAML") return { ok: false as const, error: "This company is not set up for SAML." };
  if (!input.idpCert.trim()) return { ok: false as const, error: "The SAML certificate is not configured." };
  const saml = new SAML({
    idpCert: input.idpCert,
    issuer: input.audience,
    audience: input.audience,
    callbackUrl: input.callbackUrl,
    idpIssuer: input.connection.issuer,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.never,
  });
  try {
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: input.samlResponse });
    const email = String(profile?.email ?? profile?.mail ?? profile?.nameID ?? "").trim().toLowerCase();
    const issuer = String(profile?.issuer ?? "");
    const domainError = assertSsoIdentity({ email, issuer, connection: input.connection });
    if (domainError) return { ok: false as const, error: domainError };
    return { ok: true as const, email, issuer };
  } catch {
    return { ok: false as const, error: "The SAML assertion signature is not valid." };
  }
}
