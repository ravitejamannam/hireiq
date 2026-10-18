export type SsoConnection = {
  companyId: number;
  provider: "GOOGLE_WORKSPACE" | "OKTA" | "AZURE_AD";
  protocol?: "OIDC" | "SAML";
  domain: string;
  issuer: string;
  clientId: string;
  enabled: boolean;
};

export function emailDomain(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return domain;
}

export function ssoConnectionForEmail(email: string, connections: SsoConnection[]) {
  const domain = emailDomain(email);
  return connections.find((connection) => connection.enabled && connection.domain.toLowerCase() === domain) ?? null;
}

export function assertSsoIdentity(input: { email: string; issuer: string; connection: SsoConnection }) {
  const domain = emailDomain(input.email);
  if (!input.connection.enabled) return "This company's sign-in is turned off.";
  if (domain !== input.connection.domain.toLowerCase()) {
    return "That email domain is not allowed for this company.";
  }
  if (input.issuer.replace(/\/$/, "") !== input.connection.issuer.replace(/\/$/, "")) {
    return "The identity provider does not match this company.";
  }
  return null;
}
