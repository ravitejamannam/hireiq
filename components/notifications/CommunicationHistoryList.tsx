import NotificationCard from "@/components/notifications/NotificationCard";
import type { getNotifications } from "@/lib/repositories/notification-repository";

type Notification = Awaited<ReturnType<typeof getNotifications>>[number];

export type CommunicationHistoryListProps = {
  notifications: Notification[];
  emptyTitle: string;
  emptyDescription: string;
  workspaceHrefFor: (notification: Notification) => string;
  workspaceLabel: string;
};

export default function CommunicationHistoryList({
  notifications,
  emptyTitle,
  emptyDescription,
  workspaceHrefFor,
  workspaceLabel,
}: CommunicationHistoryListProps) {
  if (notifications.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center">
        <p className="text-lg font-medium text-black">{emptyTitle}</p>
        <p className="mt-2 text-sm text-zinc-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          type={notification.type}
          message={notification.message}
          createdAt={notification.createdAt}
          jobTitle={notification.job.title}
          jobStatus={notification.job.status}
          requirementLifecycle={notification.job.requirementLifecycle}
          interviewerName={notification.interviewer?.name ?? null}
          interviewerCategory={notification.interviewer?.category ?? null}
          interviewerAvailability={
            notification.interviewer?.availability ?? null
          }
          companyName={notification.company?.name ?? null}
          workspaceHref={workspaceHrefFor(notification)}
          workspaceLabel={workspaceLabel}
        />
      ))}
    </div>
  );
}
