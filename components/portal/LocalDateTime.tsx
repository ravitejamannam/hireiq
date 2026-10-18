"use client";

import { useEffect, useState } from "react";

export function LocalDateTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const formatted = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso));
    setLabel(`${formatted} (${timeZone})`);
  }, [iso]);

  return <time dateTime={iso}>{label ?? iso}</time>;
}

export function RememberTimeZone({ endpoint }: { endpoint: string }) {
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeZone }),
    });
  }, [endpoint]);
  return null;
}
