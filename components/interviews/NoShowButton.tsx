"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { markInterviewNoShow, sendInterviewRescheduleLink } from "@/app/actions/interview-actions";

export default function NoShowButton({
  interviewId,
  applicationId,
  noShow,
}: {
  interviewId: number;
  applicationId: number;
  noShow: boolean;
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded border px-2 py-1 text-xs"
        onClick={() => {
          void markInterviewNoShow(interviewId, !noShow).then(() => router.refresh());
        }}
      >
        {noShow ? "Clear no-show" : "Mark no-show"}
      </button>
      {noShow ? (
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => {
            void sendInterviewRescheduleLink(applicationId).then((result) => setLink(result.bookingUrl));
          }}
        >
          Send reschedule link
        </button>
      ) : null}
      {link ? <a className="text-xs underline" href={link}>Open link</a> : null}
    </span>
  );
}
