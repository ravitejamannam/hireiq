import NotificationsClient from "@/components/notifications/NotificationsClient";
import { getNotifications } from "@/lib/repositories/notification-repository";

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  return <NotificationsClient initialNotifications={notifications} />;
}
