type AuthButtonProps = {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
  isLoading?: boolean;
  disabled?: boolean;
};

export default function AuthButton({
  label,
  onClick,
  type = "button",
  isLoading,
  disabled,
}: AuthButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className="
        w-full
        rounded-xl
        bg-black
        px-4
        py-3
        font-medium
        text-white
        transition-all
        duration-200
        hover:bg-zinc-800
        hover:shadow-md
        active:scale-[0.98]
        disabled:cursor-not-allowed
        disabled:opacity-60
      "
    >
      {isLoading ? "Signing In..." : label}
    </button>
  );
}