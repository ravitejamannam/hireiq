"use client";

type ButtonProps = {
  label: string;
  variant: "primary" | "secondary";
  onClick: () => void;
};

export default function Button({
  label,
  variant,
  onClick,
}: ButtonProps) {
  const buttonStyles = {
    primary: "bg-stone-900 text-[#FBF9F4] shadow-sm hover:bg-stone-700",
    secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-full px-6 py-3 font-semibold transition-colors disabled:opacity-50 ${buttonStyles[variant]}`}
    >
      {label}
    </button>
  );
}