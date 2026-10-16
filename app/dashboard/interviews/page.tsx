import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Interviews",
};

export default function InterviewsPage() {
  notFound();
}
