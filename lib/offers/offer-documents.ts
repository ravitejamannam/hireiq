function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "To be confirmed";
  return value.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export type OfferDocumentInput = {
  kind: "offer" | "joining";
  candidateName: string;
  jobTitle: string;
  companyName: string;
  location: string | null;
  compensation: string;
  terms: string | null;
  proposedStartDate: Date | null;
  acceptedAt: Date | null;
  letterDate?: Date;
};

export function renderOfferDocumentHtml(input: OfferDocumentInput): string {
  const today = formatDate(input.letterDate ?? new Date());
  const firstName = input.candidateName.split(" ")[0] || input.candidateName;
  const title =
    input.kind === "joining"
      ? "Appointment / Joining Letter"
      : "Offer of Employment";
  const termsRow = input.terms?.trim()
    ? `<tr><td>Terms</td><td>${escapeHtml(input.terms.trim())}</td></tr>`
    : "";
  const startRow = `<tr><td>Proposed start date</td><td>${escapeHtml(formatDate(input.proposedStartDate))}</td></tr>`;
  const acceptedRow =
    input.kind === "joining" && input.acceptedAt
      ? `<tr><td>Accepted on</td><td>${escapeHtml(formatDate(input.acceptedAt))}</td></tr>`
      : "";

  const bodyIntro =
    input.kind === "joining"
      ? `This letter confirms your appointment as <strong>${escapeHtml(input.jobTitle)}</strong> at <strong>${escapeHtml(input.companyName)}</strong>, following your acceptance of the offer.`
      : `We are delighted to extend an offer for the position of <strong>${escapeHtml(input.jobTitle)}</strong> at <strong>${escapeHtml(input.companyName)}</strong>. Following your interviews and assessment, we believe you will be a valuable addition to our team. Assessment score is not a hire decision.`;

  const closing =
    input.kind === "joining"
      ? "Please report as scheduled and complete standard onboarding. We look forward to working with you."
      : "This offer is contingent upon standard background verification and execution of customary onboarding documents. Please confirm acceptance on the offer link you received.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — ${escapeHtml(input.candidateName)}</title>
<style>
  @media print { .no-print { display: none; } }
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #18181b; line-height: 1.7; }
  .toolbar { font-family: system-ui, sans-serif; margin-bottom: 32px; padding: 12px; background: #f4f4f5; border-radius: 8px; }
  h1 { font-size: 22px; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid #18181b; padding-bottom: 12px; }
  .meta { margin: 24px 0; }
  table.terms { width: 100%; border-collapse: collapse; margin: 24px 0; font-family: system-ui, sans-serif; font-size: 14px; }
  table.terms td { border: 1px solid #d4d4d8; padding: 10px 14px; }
  table.terms td:first-child { background: #fafafa; font-weight: 600; width: 40%; }
  .signature { margin-top: 64px; display: flex; justify-content: space-between; }
  .signature div { width: 45%; border-top: 1px solid #18181b; padding-top: 8px; font-size: 13px; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    Print this page (Ctrl/Cmd + P) to save as PDF.
  </div>

  <h1>${escapeHtml(title)}</h1>

  <p class="meta">
    ${escapeHtml(today)}<br /><br />
    <strong>${escapeHtml(input.candidateName)}</strong><br />
    ${escapeHtml(input.location ?? "")}
  </p>

  <p>Dear ${escapeHtml(firstName)},</p>

  <p>${bodyIntro}</p>

  <table class="terms">
    <tr><td>Position</td><td>${escapeHtml(input.jobTitle)}</td></tr>
    <tr><td>Company</td><td>${escapeHtml(input.companyName)}</td></tr>
    <tr><td>Work location</td><td>${escapeHtml(input.location ?? "To be confirmed")}</td></tr>
    <tr><td>Compensation</td><td>${escapeHtml(input.compensation)}</td></tr>
    ${startRow}
    ${termsRow}
    ${acceptedRow}
    <tr><td>Letter date</td><td>${escapeHtml(today)}</td></tr>
  </table>

  <p>${escapeHtml(closing)}</p>

  <p>Sincerely,<br /><br />
  The Hiring Team<br />
  ${escapeHtml(input.companyName)}</p>

  <div class="signature">
    <div>Candidate signature &amp; date</div>
    <div>Authorised signatory</div>
  </div>
</body>
</html>`;
}
