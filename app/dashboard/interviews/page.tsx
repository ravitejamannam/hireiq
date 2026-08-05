"use client";

import { useState } from "react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import InterviewCard from "@/components/interviews/InterviewCard";
import ScheduleInterviewButton from "@/components/interviews/ScheduleInterviewButton";
import InterviewModal from "@/components/interviews/InterviewModal";
import EmptyInterviews from "@/components/interviews/EmptyInterviews";
import { interviews as initialInterviews } from "@/data/interviews";

export default function InterviewsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [interviews, setInterviews] = useState(initialInterviews);
  const [search, setSearch] = useState("");

  function handleCreateInterview(interview: {
    candidate: string;
    company: string;
    interviewer: string;
    date: string;
    time: string;
    status: string;
  }) {
    setInterviews((previousInterviews) => [
      ...previousInterviews,
      {
        id: previousInterviews.length + 1,
        ...interview,
      },
    ]);

    setIsModalOpen(false);
  }

  function handleDeleteInterview(id: number) {
    setInterviews((previousInterviews) =>
      previousInterviews.filter((interview) => interview.id !== id),
    );
  }

  const filteredInterviews = interviews.filter((interview) =>
    interview.candidate.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Interviews</h1>

          <p className="mt-2 text-zinc-600">Manage all scheduled interviews.</p>
        </div>

        <div className="mt-8">
          <input
            type="text"
            placeholder="Search interviews..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="
      w-full
      rounded-xl
      border
      border-zinc-300
      bg-white
      px-4
      py-3
      text-black
      placeholder:text-zinc-400
      outline-none
      transition
      focus:border-black
    "
          />
        </div>

        <ScheduleInterviewButton onClick={() => setIsModalOpen(true)} />
      </div>

      {filteredInterviews.length === 0 ?(
        <div className="mt-10">
          <EmptyInterviews />
        </div>
      ) : (

      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredInterviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            candidate={interview.candidate}
            company={interview.company}
            interviewer={interview.interviewer}
            date={interview.date}
            time={interview.time}
            status={interview.status}
            id={interview.id}
            onDelete={handleDeleteInterview}
          />
        ))}
      </div>
      )}

      <InterviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateInterview}
      />
    </DashboardLayout>
  );
}
