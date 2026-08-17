import { headers } from "next/headers";

export async function readRequestIp() {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }

    return headerList.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}
