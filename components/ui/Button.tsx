"use client";

type ButtonProps = {
  label: string;
  variant: "primary" | "secondary" ;
  onClick: () => void;
};

export default function Button({
  label,
  variant,
  onClick,
}: ButtonProps) {
  const buttonStyles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "bg-white text-slate-900 hover:bg-slate-100",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 font-medium transition-colors ${buttonStyles[variant]}`}
    >
      {label}
    </button>
  );
}
