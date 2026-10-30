import { Suspense } from "react";
import { AllTasksClient } from "@/components/tasks/all-tasks";

export const metadata = { title: "Tasks · Common Pastures" };

export default function TasksPage() {
  return (
    <Suspense>
      <AllTasksClient />
    </Suspense>
  );
}
