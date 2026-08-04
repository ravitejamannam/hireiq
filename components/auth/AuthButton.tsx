type AuthButtonProps = {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit";
};

export default function AuthButton({
  label,
  onClick,
  type = "button",
}: AuthButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
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
      "
    >
      {label}
    </button>
  );
}