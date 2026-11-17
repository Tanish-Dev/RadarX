import { ArrowDown, ArrowUp } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── Chip ────────────────────────────────────────────────────────────────────
type ChipTone = "default" | "new" | "warn" | "bad" | "accent" | "glass" | "outline";
const CHIP: Record<ChipTone, string> = {
  default: "bg-chip text-ink",
  new: "bg-good/12 text-good font-medium",
  warn: "bg-warn/14 text-warn",
  bad: "bg-bad/12 text-bad",
  accent: "bg-accent/10 text-accent",
  glass: "bg-white/22 text-white backdrop-blur-sm",
  outline: "border border-line text-ink-2",
};

export function Chip({ tone = "default", children, className, ...rest }: { tone?: ChipTone } & ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] leading-none", CHIP[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}

// ── IconButton (round, 44–48px, 1px border) ────────────────────────────────
type IconTone = "default" | "solid" | "glass" | "accent";
const ICON: Record<IconTone, string> = {
  default: "bg-card border border-line text-ink hover:bg-raised",
  solid: "bg-raised text-ink hover:bg-chip",
  glass: "glass !rounded-full text-ink hover:bg-raised/60",
  accent: "bg-active text-active-ink",
};

export function IconButton({
  tone = "default",
  size = 44,
  label,
  dot,
  children,
  className,
  ...rest
}: { tone?: IconTone; size?: 28 | 32 | 36 | 40 | 44 | 48; label: string; dot?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full transition-[background,box-shadow,transform] duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        ICON[tone],
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
      {dot && <span className="absolute right-[9px] top-[9px] size-2 rounded-full bg-bad ring-2 ring-card" />}
    </button>
  );
}

// ── MatchRing ───────────────────────────────────────────────────────────────
/**
 * Circular progress with the value in the centre; the remaining part of the
 * track is dashed (ref-00). Without a score, shows `label` (e.g. freshness "12m").
 */
export function MatchRing({
  value,
  label,
  size = 96,
  stroke = 2,
  onGradient = false,
  className,
}: { value: number | null; label?: string; size?: number; stroke?: number; onGradient?: boolean; className?: string }) {
  const r = (size - stroke * 2) / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const color = onGradient ? "#fff" : "var(--text)";
  const track = onGradient ? "rgba(255,255,255,.55)" : "var(--text-3)";
  const fontSize = Math.round(size / 3);
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={1} strokeDasharray="2 3" />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            style={{ ["--ring-from" as string]: `${c * pct}`, animation: "rx-ring .7s cubic-bezier(.2,.8,.2,1) both" }}
          />
        )}
      </svg>
      <span
        className={cn("num absolute inset-0 flex items-center justify-center font-light", onGradient ? "text-white" : "text-ink")}
        style={{ fontSize: value == null ? fontSize * 0.7 : fontSize }}
      >
        {value ?? label ?? "–"}
      </span>
    </div>
  );
}

// ── KeyValueRow (hairline dividers, ref-02 layout) ─────────────────────────
export function KeyValueRow({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 border-b border-line py-3 text-[14px] first:border-t first:border-t-ink/30", className)}>
      <span className="text-ink-2">{k}</span>
      <span className="num text-right text-ink">{v}</span>
    </div>
  );
}

// ── Big number (ref-01: light numerals, small unit, coloured trend line beneath) ──
const TREND = /^[+\-−]\s?\d/;

export function Trend({ value, className }: { value: string; className?: string }) {
  const down = /^[-−]/.test(value);
  const Icon = down ? ArrowDown : ArrowUp;
  return (
    <span className={cn("num inline-flex items-center gap-1 text-[14px] font-normal", down ? "text-bad" : "text-good", className)}>
      <Icon size={14} strokeWidth={2.2} />
      {value}
    </span>
  );
}

export function BigNumber({ value, delta, size = "lg", className }: { value: ReactNode; delta?: ReactNode; size?: "md" | "lg" | "xl"; className?: string }) {
  const sz = { md: "text-[30px]", lg: "text-[42px]", xl: "text-[64px] md:text-[84px]" }[size];
  const isTrend = typeof delta === "string" && TREND.test(delta);
  return (
    <span className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <span className={cn("num inline-flex items-baseline font-light leading-none tracking-[-0.035em]", sz)}>
        {value}
        {delta != null && !isTrend && <span className="ml-2 text-[14px] font-normal tracking-[-0.01em] text-ink-2">{delta}</span>}
      </span>
      {isTrend && <Trend value={delta as string} />}
    </span>
  );
}

// ── Section title / two-tone hero ──────────────────────────────────────────
/** Page title, ref-01 style: one line, regular weight, first word muted. */
export function HeroTitle({ light, strong, chip, className }: { light: string; strong: string; chip?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
      <h1 className="text-[34px] font-normal leading-[1.05] tracking-[-0.03em] md:text-[46px]">
        <span className="text-ink-2">{light}</span> <span className="text-ink">{strong}</span>
      </h1>
      {chip}
    </div>
  );
}

export function LiveChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full bg-chip px-4 text-[14px]">
      <span className="rx-pulse size-2 rounded-full bg-good" />
      {label}
    </span>
  );
}
