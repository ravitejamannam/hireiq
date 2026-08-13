import { notFound, redirect } from "next/navigation";

import {
  AuthenticationError,
  AuthorizationError,
  requireInterviewerPortal,
} from "@/lib/auth/authorization";
import InterviewerPortalLayout from "@/components/interviewer/InterviewerPortalLayout";

export default async function InterviewerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let interviewer;

  try {
    interviewer = await requireInterviewerPortal();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }

    if (error instanceof AuthorizationError) {
      notFound();
    }

    throw error;
  }

  return (
    <InterviewerPortalLayout
      interviewerName={interviewer.interviewer.name}
      userName={interviewer.name}
    >
      {children}
    </InterviewerPortalLayout>
  );
}
