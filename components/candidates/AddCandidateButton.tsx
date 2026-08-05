"use client";

type AddCandidateButtonProps = {
  onClick: () => void;
};

export default function AddCandidateButton({
  onClick,
}: AddCandidateButtonProps) {
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
      + Add Candidate
    </button>
  );
}