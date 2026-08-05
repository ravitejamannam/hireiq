"use client";

type AddCompanyButtonProps = {
  onClick: () => void;
};

export default function AddCompanyButton({
  onClick,
}: AddCompanyButtonProps) {
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
        transition-colors
        hover:bg-zinc-800
      "
    >
      + Add Company
    </button>
  );
}