import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { validateSamlLogin } from "@/lib/auth/saml";
import type { SsoConnection } from "@/lib/auth/sso";

const connection: SsoConnection = {
  companyId: 1,
  provider: "OKTA",
  protocol: "SAML",
  domain: "nimbus.example",
  issuer: "https://nimbus.okta.com",
  clientId: "hireiq",
  enabled: true,
};

function certificatePair() {
  const directory = mkdtempSync(join(tmpdir(), "hireiq-saml-"));
  const key = join(directory, "key.pem");
  const cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert, "-days", "1", "-nodes", "-subj", "/CN=nimbus-test"]);
  return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") };
}

function signedResponse(input: { cert: string; key: string; email: string; audience: string }) {
  const require = createRequire(join(process.cwd(), "node_modules/@node-saml/node-saml/package.json"));
  const { SignedXml } = require("xml-crypto") as { SignedXml: new (options: { privateKey: string }) => {
    addReference: (options: { xpath: string; transforms: string[]; digestAlgorithm: string }) => void;
    signatureAlgorithm: string;
    canonicalizationAlgorithm: string;
    computeSignature: (xml: string, options: { location: { reference: string; action: string } }) => void;
    getSignedXml: () => string;
  } };
  const assertionId = "_assertion1";
  const xml = `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response1" Version="2.0" IssueInstant="2026-10-18T12:00:00Z" Destination="https://hireiq.example/api/auth/saml/acs">
  <saml:Issuer>https://nimbus.okta.com</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0" IssueInstant="2026-10-18T12:00:00Z">
    <saml:Issuer>https://nimbus.okta.com</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${input.email}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData NotOnOrAfter="2099-01-01T00:00:00Z" Recipient="https://hireiq.example/api/auth/saml/acs"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2020-01-01T00:00:00Z" NotOnOrAfter="2099-01-01T00:00:00Z">
      <saml:AudienceRestriction><saml:Audience>${input.audience}</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="2026-10-18T12:00:00Z">
      <saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext>
    </saml:AuthnStatement>
  </saml:Assertion>
</samlp:Response>`;
  const signer = new SignedXml({ privateKey: input.key });
  signer.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  signer.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
  signer.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  signer.computeSignature(xml, { location: { reference: "//*[local-name(.)='Assertion']", action: "append" } });
  return Buffer.from(signer.getSignedXml()).toString("base64");
}

describe("SAML", () => {
  it("does not accept a caller-supplied signature flag", () => {
    const source = readFileSync(join(process.cwd(), "lib/auth/saml.ts"), "utf8");
    expect(source).toMatch(/@node-saml\/node-saml/);
    expect(source).not.toMatch(/signatureValid/);
    expect(source).toMatch(/wantAssertionsSigned: true/);
  });

  it("rejects a missing certificate and an unsigned response", async () => {
    expect((await validateSamlLogin({
      samlResponse: Buffer.from("<samlp:Response/>").toString("base64"),
      connection,
      idpCert: "",
      audience: "hireiq",
      callbackUrl: "https://hireiq.example/api/auth/saml/acs",
    })).error).toMatch(/certificate/);
    const { cert } = certificatePair();
    const rejected = await validateSamlLogin({
      samlResponse: Buffer.from("<samlp:Response><saml:Assertion/></samlp:Response>").toString("base64"),
      connection,
      idpCert: cert,
      audience: "hireiq",
      callbackUrl: "https://hireiq.example/api/auth/saml/acs",
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/signature/);
  });

  it("accepts an assertion signed by the company certificate and rejects another company's key", async () => {
    const ours = certificatePair();
    const theirs = certificatePair();
    const response = signedResponse({ cert: ours.cert, key: ours.key, email: "priya@nimbus.example", audience: "hireiq" });
    const accepted = await validateSamlLogin({
      samlResponse: response,
      connection,
      idpCert: ours.cert,
      audience: "hireiq",
      callbackUrl: "https://hireiq.example/api/auth/saml/acs",
    });
    expect(accepted).toMatchObject({ ok: true, email: "priya@nimbus.example" });
    const wrapped = await validateSamlLogin({
      samlResponse: response,
      connection,
      idpCert: theirs.cert,
      audience: "hireiq",
      callbackUrl: "https://hireiq.example/api/auth/saml/acs",
    });
    expect(wrapped.ok).toBe(false);
  });

  it("rejects a signed assertion for another company's email domain", async () => {
    const ours = certificatePair();
    const response = signedResponse({ cert: ours.cert, key: ours.key, email: "priya@kaveri.example", audience: "hireiq" });
    const result = await validateSamlLogin({
      samlResponse: response,
      connection,
      idpCert: ours.cert,
      audience: "hireiq",
      callbackUrl: "https://hireiq.example/api/auth/saml/acs",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not allowed/);
  });
});
