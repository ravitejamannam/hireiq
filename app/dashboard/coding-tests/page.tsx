import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Coding tests",
};

export default function CodingTestsPage() {
  notFound();
}
