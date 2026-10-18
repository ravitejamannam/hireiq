import { signWebhookBody } from "@/lib/api/partner-webhook";

export const HRIS_PROVIDERS = ["KEKA", "DARWINBOX", "ZOHO_PEOPLE", "BAMBOOHR", "CSV"] as const;
export type HrisProvider = (typeof HRIS_PROVIDERS)[number];

export type HireRecord = {
  companyId: number;
  applicationId: number;
  name: string;
  email: string;
  title: string;
  hiredAt: string;
};

const MAPS: Record<Exclude<HrisProvider, "CSV">, (row: HireRecord) => Record<string, string>> = {
  KEKA: (row) => ({ employeeName: row.name, email: row.email, designation: row.title, dateOfJoining: row.hiredAt.slice(0, 10) }),
  DARWINBOX: (row) => ({ FullName: row.name, Email: row.email, Designation: row.title, DateOfJoining: row.hiredAt.slice(0, 10) }),
  ZOHO_PEOPLE: (row) => ({ EmployeeName: row.name, EmailID: row.email, Designation: row.title, Dateofjoining: row.hiredAt.slice(0, 10) }),
  BAMBOOHR: (row) => ({ firstName: row.name, workEmail: row.email, jobTitle: row.title, hireDate: row.hiredAt.slice(0, 10) }),
};

export function hrisPayload(provider: HrisProvider, row: HireRecord) {
  if (provider === "CSV") return null;
  return MAPS[provider](row);
}

export function hrisCsv(row: HireRecord) {
  const header = "name,email,title,hiredAt";
  const line = [row.name, row.email, row.title, row.hiredAt].map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
  return `${header}\n${line}\n`;
}

export function hireHandoff(input: { provider: HrisProvider; row: HireRecord; secret: string | null; status: string }) {
  if (input.row.companyId <= 0) return { ok: false as const, error: "Application not found." };
  if (input.status !== "HIRED") return { ok: false as const, error: "Handoff runs only after hire." };
  const timestamp = input.row.hiredAt;
  if (input.provider === "CSV" || !input.secret) {
    return {
      ok: true as const,
      delivery: "csv" as const,
      body: hrisCsv(input.row),
      signature: null,
      audit: { companyId: input.row.companyId, action: "HRIS_CSV_EXPORTED", targetType: "Application", targetId: input.row.applicationId, reason: input.provider },
    };
  }
  const body = JSON.stringify({ provider: input.provider, data: hrisPayload(input.provider, input.row) });
  return {
    ok: true as const,
    delivery: "webhook" as const,
    body,
    signature: signWebhookBody(input.secret, timestamp, body),
    timestamp,
    audit: { companyId: input.row.companyId, action: "HRIS_WEBHOOK_SIGNED", targetType: "Application", targetId: input.row.applicationId, reason: input.provider },
  };
}
