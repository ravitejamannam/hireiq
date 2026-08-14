"use client";

import { useState } from "react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CommunicationHistoryList from "@/components/notifications/CommunicationHistoryList";
import type { getNotifications } from "@/lib/repositories/notification-repository";

type Notification = Awaited<ReturnType<typeof getNotifications>>[number];

type NotificationsClientProps = {
  initialNotifications: Notification[];
};

export default function NotificationsClient({
  initialNotifications,
}: NotificationsClientProps) {
  const [search, setSearch] = useState("");

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

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-black">Communication history</h1>
        <p className="mt-2 text-zinc-600">
          Recorded requirement-ready, database-ready, and shortlist-ready
          communications. Email delivery status is not stored.
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
      />
    </DashboardLayout>
  );
}
