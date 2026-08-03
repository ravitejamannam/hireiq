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
    primary:
      "bg-black text-white hover:bg-zinc-800",

    secondary:
      "border border-zinc-300 bg-white text-black hover:bg-zinc-100",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-5 py-2.5 font-medium transition-colors ${buttonStyles[variant]}`}
    >
      {label}
    </button>
  );
}