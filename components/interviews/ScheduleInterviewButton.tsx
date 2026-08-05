"use client";

type ScheduleInterviewButtonProps = {
  onClick: () => void;
};

export default function ScheduleInterviewButton({
  onClick,
}: ScheduleInterviewButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
        rounded-lg
        bg-black
        px-5
        py-3
        text-sm
        font-semibold
        text-white
        transition
        hover:bg-zinc-800
      "
    >
      + Schedule Interview
    </button>
  );
}