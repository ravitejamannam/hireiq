import type { ReactNode } from "react";

import InterviewerSidebar from "@/components/interviewer/InterviewerSidebar";

type InterviewerPortalLayoutProps = {
  interviewerName: string;
  userName: string;
  children: ReactNode;
};

export default function InterviewerPortalLayout({
  interviewerName,
  userName,
  children,
}: InterviewerPortalLayoutProps) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <InterviewerSidebar
        interviewerName={interviewerName}
        userName={userName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
