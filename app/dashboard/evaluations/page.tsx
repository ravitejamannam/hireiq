import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluations",
};

import { redirect } from "next/navigation";

export default function EvaluationsPage() {
  redirect("/dashboard/technical-evaluations");
}
