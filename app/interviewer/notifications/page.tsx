import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
};

import CommunicationHistoryList from "@/components/notifications/CommunicationHistoryList";
import { requireInterviewerPortal } from "@/lib/auth/authorization";
import { getNotifications } from "@/lib/repositories/notification-repository";

export default async function InterviewerNotificationsPage() {
  await requireInterviewerPortal();
  const notifications = await getNotifications();

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          Communication history
        </h1>
        <p className="mt-2 text-zinc-600">
          Requirement-ready and database-ready communications assigned to you.
          Email delivery is recorded when the message is sent.
        </p>
      </div>

      <CommunicationHistoryList
        notifications={notifications}
        emptyTitle="No assigned communications yet"
        emptyDescription="When a requirement is ready for you or the sourcing database is ready, it will appear here."
        workspaceHrefFor={(notification) =>
          `/interviewer/requirements/${notification.jobId}`
        }
        workspaceLabel="Open requirement"
      />
    </div>
  );
}
