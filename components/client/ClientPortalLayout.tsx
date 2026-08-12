import type { ReactNode } from "react";

import ClientSidebar from "@/components/client/ClientSidebar";

type ClientPortalLayoutProps = {
  companyName: string;
  userName: string;
  children: ReactNode;
};

export default function ClientPortalLayout({
  companyName,
  userName,
  children,
}: ClientPortalLayoutProps) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <ClientSidebar companyName={companyName} userName={userName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
