type AuthInputProps = {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

export default function AuthInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: AuthInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-black">
        {label}
      </label>

      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="
          w-full
          rounded-xl
          border
          border-zinc-300
          bg-white
          px-4
          py-3
          text-black
          placeholder:text-zinc-400
          outline-none
          transition
          focus:border-black
        "
      />
    </div>
  );
}