"use client";

type AddCodingTestButtonProps = {
  onClick: () => void;
};

export default function AddCodingTestButton({
  onClick,
}: AddCodingTestButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
    >
      + Add Coding Test
    </button>
  );
}