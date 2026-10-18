import { portalExportResponse } from "@/app/portal/act/route";

export async function GET(request: Request) {
  return portalExportResponse(request);
}
