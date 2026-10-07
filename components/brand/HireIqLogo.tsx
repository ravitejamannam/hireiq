type HireIqLogoProps = {
  /** Pixel size of the mark. The wordmark scales with it. */
  markSize?: number;
  wordmark?: boolean;
  className?: string;
};

/**
 * HireIQ mark: a stone tile with a cream H and a clay proof-bar.
 * The bar is the only color, so the mark stays quiet next to UI chrome.
 */
export function HireIqMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#211d19" />
      <path
        d="M8.6 7.4h4.4v6.4h6v-6.4h4.4v17.2h-4.4v-6.6h-6v6.6H8.6V7.4z"
        fill="#FBF9F4"
      />
      <rect x="13" y="13.8" width="6" height="4.4" rx="0.6" fill="#c46a45" />
    </svg>
  );
}

export default function HireIqLogo({
  markSize = 32,
  wordmark = true,
  className,
}: HireIqLogoProps) {
  const wordSize =
    markSize >= 40 ? "text-2xl" : markSize >= 32 ? "text-xl" : "text-base";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <HireIqMark size={markSize} />
      {wordmark ? (
        <span
          className={`${wordSize} font-bold tracking-tight text-stone-900`}
        >
          Hire
          <span className="text-[#a95236]">IQ</span>
        </span>
      ) : null}
    </span>
  );
}
