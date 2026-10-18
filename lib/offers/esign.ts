export function createOfferSignature(input: {
  companyId: number;
  applicationCompanyId: number;
  applicationId: number;
  provider: "LEEGALITY" | "DOCUSIGN";
  aadhaar: boolean;
  configured: boolean;
}) {
  if (input.companyId !== input.applicationCompanyId) return { ok: false as const, error: "Offer not found." };
  if (input.aadhaar && input.provider !== "LEEGALITY") {
    return { ok: false as const, error: "Aadhaar eSign is available through Leegality." };
  }
  if (!input.configured) {
    return {
      ok: false as const,
      status: "DRAFT" as const,
      error: "Connect Leegality or DocuSign before sending an offer.",
      audit: {
        companyId: input.companyId,
        action: "OFFER_ESIGN_BLOCKED",
        targetType: "Application",
        targetId: input.applicationId,
        reason: "Provider credentials are not set.",
      },
    };
  }
  return {
    ok: true as const,
    status: "SENT" as const,
    audit: {
      companyId: input.companyId,
      action: "OFFER_ESIGN_SENT",
      targetType: "Application",
      targetId: input.applicationId,
      reason: input.aadhaar ? "Leegality Aadhaar eSign requested." : `${input.provider} envelope requested.`,
    },
  };
}
