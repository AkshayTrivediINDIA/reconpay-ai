import { cn } from "@/lib/ui";

export function BrandMark({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border",
        tone === "light"
          ? "border-indigo-200 bg-indigo-50 text-[var(--primary)]"
          : "border-white/15 bg-white/10 text-white",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
        <path
          d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m8 12 2.6 2.6L16 9.2"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Brand({
  className,
  tone = "light",
  subtitle,
}: {
  className?: string;
  tone?: "light" | "dark";
  subtitle?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark tone={tone} />
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[15px] font-semibold leading-5 tracking-tight",
            tone === "light" ? "text-slate-950" : "text-white",
          )}
        >
          ReconPay <span className="font-normal opacity-70">AI</span>
        </span>
        {subtitle ? (
          <span
            className={cn(
              "block truncate text-[10px] uppercase tracking-[0.14em]",
              tone === "light" ? "text-slate-500" : "text-slate-400",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
