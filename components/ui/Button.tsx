"use client";

type ButtonProps = {
  label: string;
  variant: "primary" | "danger";
  onClick: () => void;
};

export default function Button({
  label,
  variant,
  onClick,
}: ButtonProps) {
  const styles = {
    primary: "bg-slate-900 hover:bg-slate-700",
    danger: "bg-red-600 hover:bg-red-500",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-white ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
