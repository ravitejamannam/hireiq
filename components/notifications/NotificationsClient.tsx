"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { retryNotificationEmailDelivery } from "@/app/actions/communication-actions";
import { describeUnsentCommunicationEmail } from "@/lib/communication/email-follow-up";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CommunicationHistoryList from "@/components/notifications/CommunicationHistoryList";
import type { getNotifications } from "@/lib/repositories/notification-repository";

type Notification = Awaited<ReturnType<typeof getNotifications>>[number];

type NotificationsClientProps = {
  initialNotifications: Notification[];
};

function retryEventFor(
  type: Notification["type"],
): "T68" | "T69" | "T70" | null {
  if (type === "INTERVIEWER_REQUIREMENT_READY") return "T68";
  if (type === "INTERVIEWER_DATABASE_READY") return "T69";
  if (type === "CLIENT_SHORTLIST_READY") return "T70";
  return null;
}

export default function NotificationsClient({
  initialNotifications,
}: NotificationsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  const filteredNotifications = initialNotifications.filter((notification) => {
    const query = search.trim().toLowerCase();

    if (!query) return true;

    const searchableValues = [
      notification.message,
      notification.type,
      notification.job.title,
      notification.interviewer?.name,
      notification.company?.name,
      notification.job.requirementLifecycle,
    ].filter((value): value is string => Boolean(value));

    return searchableValues.some((value) =>
      value.toLowerCase().includes(query),
    );
  });

  async function handleRetry(notificationId: number) {
    const notification = initialNotifications.find(
      (row) => row.id === notificationId,
    );
    setRetryNotice(null);
    setRetryingId(notificationId);

    try {
      const email = await retryNotificationEmailDelivery(notificationId);
      const event = notification ? retryEventFor(notification.type) : "T68";
      const notice = event
        ? describeUnsentCommunicationEmail(email, event)
        : null;
      if (email.attempted && email.sent) {
        setRetryNotice("Email was sent.");
      } else if (email.attempted === false && email.reason === "already-delivered") {
        setRetryNotice("Email was already delivered.");
      } else {
        setRetryNotice(notice);
      }
      router.refresh();
    } catch (error) {
      setRetryNotice(
        error instanceof Error ? error.message : "Email could not be retried.",
      );
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-black">Communication history</h1>
        <p className="mt-2 text-zinc-600">
          Recorded requirement-ready, database-ready, and shortlist-ready
          communications. Email is a delivery side effect and can be retried
          if it was not sent.
        </p>
      </div>

      <div className="mt-8">
        <label htmlFor="notifications-search" className="sr-only">
          Search communication history
        </label>
        <input
          id="notifications-search"
          type="text"
          placeholder="Search by message, requirement, interviewer, company, or type..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            placeholder:text-zinc-400
            focus:border-black
          "
        />
      </div>

      <CommunicationHistoryList
        notifications={filteredNotifications}
        emptyTitle={
          initialNotifications.length === 0
            ? "No communication history yet"
            : "No matching communications"
        }
        emptyDescription={
          initialNotifications.length === 0
            ? "Requirement-ready, database-ready, and shortlist-ready events appear here after they are recorded."
            : "Try a different search term."
        }
        workspaceHrefFor={(notification) =>
          `/dashboard/requirements/${notification.jobId}`
        }
        workspaceLabel="Open requirement"
        canRetry
        retryingId={retryingId}
        onRetry={(notificationId) => {
          void handleRetry(notificationId);
        }}
        retryNotice={retryNotice}
      />
    </DashboardLayout>
  );
}
