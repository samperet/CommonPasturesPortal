import { AllTasksClient } from "@/components/tasks/all-tasks";

export const metadata = { title: "Tasks · Common Pastures" };

/**
 * No Suspense boundary of its own (every route is rendered on request, so the
 * address is there to read): hydrated later, the page would find the
 * directory already loaded and not match the server's HTML.
 */
export default function TasksPage() {
  return <AllTasksClient />;
}
