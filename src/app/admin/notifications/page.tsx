import { NotificationsClient } from "@/components/admin/notifications-client";

export const metadata = { title: "Notifications · Common Pastures" };

/** Admins only: the API refuses everyone else. */
export default function NotificationsPage() {
  return <NotificationsClient />;
}
