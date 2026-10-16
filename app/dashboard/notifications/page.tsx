import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
};

import NotificationsClient from "@/components/notifications/NotificationsClient";
import { requireAdmin } from "@/lib/auth/authorization";
import { getNotifications } from "@/lib/repositories/notification-repository";

export default async function NotificationsPage() {
  await requireAdmin();
  const notifications = await getNotifications();

  return <NotificationsClient initialNotifications={notifications} />;
}
