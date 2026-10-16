import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Reports",
};

export default function ReportsPage() {
  notFound();
}
