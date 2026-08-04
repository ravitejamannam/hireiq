type AuthButtonProps = {
  label: string;
};

export default function AuthButton({
  label,
}: AuthButtonProps) {
  return (
    <button
      className="
        w-full
        rounded-xl
        bg-black
        px-4
        py-3
        font-medium
        text-white
        transition
        hover:bg-zinc-800
      "
    >
      {label}
    </button>
  );
}