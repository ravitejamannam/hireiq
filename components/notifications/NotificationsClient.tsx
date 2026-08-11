"use client";

import { useState } from "react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import NotificationCard from "@/components/notifications/NotificationCard";
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
      notification.interviewer.name,
      notification.job.requirementLifecycle,
    ];

    return searchableValues.some((value) =>
      value.toLowerCase().includes(query),
    );
  });

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-black">Notifications</h1>
        <p className="mt-2 text-zinc-600">
          Internal requirement handoff notifications for assigned interviewers.
        </p>
      </div>

      <div className="mt-8">
        <label htmlFor="notifications-search" className="sr-only">
          Search notifications
        </label>
        <input
          id="notifications-search"
          type="text"
          placeholder="Search by message, requirement, interviewer, or type..."
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

      {filteredNotifications.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center">
          <p className="text-lg font-medium text-black">
            {initialNotifications.length === 0
              ? "No notifications yet"
              : "No matching notifications"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {initialNotifications.length === 0
              ? "Notify an assigned interviewer from a posted requirement to create a handoff record."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              type={notification.type}
              message={notification.message}
              createdAt={notification.createdAt}
              jobTitle={notification.job.title}
              jobStatus={notification.job.status}
              requirementLifecycle={notification.job.requirementLifecycle}
              interviewerName={notification.interviewer.name}
              interviewerCategory={notification.interviewer.category}
              interviewerAvailability={notification.interviewer.availability}
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
