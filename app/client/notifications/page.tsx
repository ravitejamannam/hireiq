import CommunicationHistoryList from "@/components/notifications/CommunicationHistoryList";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getNotifications } from "@/lib/repositories/notification-repository";

export default async function ClientNotificationsPage() {
  await requireClientPortal();
  const notifications = await getNotifications();

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Client portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          Communication history
        </h1>
        <p className="mt-2 text-zinc-600">
          Shortlist-ready communications for your company. Email delivery is
          recorded when the message is sent.
        </p>
      </div>

      <CommunicationHistoryList
        notifications={notifications}
        emptyTitle="No shortlist-ready communications yet"
        emptyDescription="When an interviewer completes shortlisting on one of your requirements, it will appear here."
        workspaceHrefFor={(notification) =>
          `/client/requirements/${notification.jobId}/shortlist`
        }
        workspaceLabel="Review shortlist"
      />
    </div>
  );
}
