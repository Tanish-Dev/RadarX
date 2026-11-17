import { CompanyLogo } from "./CompanyLogo";
import { cn } from "./primitives";

/** Company-logo badge for a posting first seen in the last 24h; pulses when < 15 min old. */
export function MapPin({
  company,
  domain,
  fresh,
  className,
  style,
}: {
  company: string;
  domain?: string | null;
  fresh?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn("rx-drop inline-flex rounded-full bg-card p-1.5 shadow-pop", fresh && "rx-pulse", className)} style={style}>
      <CompanyLogo name={company} domain={domain} size={36} />
    </span>
  );
}

/** Orange ring dot — a city / cluster with several new roles. */
export function ClusterDot({ count, className, style }: { count?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={cn("rx-drop inline-flex items-center justify-center rounded-full bg-warn/20 p-[7px]", className)}
      style={style}
      title={count ? `${count} new roles` : undefined}
    >
      <span className={cn("flex items-center justify-center rounded-full border-2 border-warn bg-card", count ? "size-7 text-[11px] font-medium text-ink" : "size-3.5")}>
        {count}
      </span>
    </span>
  );
}

/** Hover card for a pin: company, role count, newest role, freshness. */
export function MapHoverCard({ company, count, newest, ago }: { company: string; count: number; newest: string; ago: string }) {
  return (
    <div className="w-60 rounded-[20px] bg-card p-4 shadow-pop">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[15px] font-medium">{company}</span>
        <span className="num shrink-0 text-[12px] text-good">{ago}</span>
      </div>
      <p className="mt-1 truncate text-[13px] text-ink-2">{newest}</p>
      <p className="num mt-2 text-[12px] text-ink-3">
        {count} new role{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * Static, token-coloured stand-in for the live MapLibre map (Phase 4): soft land
 * masses, a water body and road lines, faded at the edges like ref-00.
 */
export function MapBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ maskImage: "radial-gradient(ellipse 85% 75% at 45% 40%, #000 45%, transparent 100%)" }}
    >
      <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" className="size-full">
        <rect width="1200" height="700" fill="var(--canvas)" />
        <path d="M0 0 H1200 V700 H0 Z" fill="var(--map-land)" opacity=".6" />
        <path d="M-20 520 C120 470 180 560 300 600 C420 640 520 590 600 640 L620 720 L-20 720 Z" fill="var(--map-water)" />
        <path d="M640 60 C700 90 690 160 760 180 C820 200 860 150 900 190 C930 230 880 280 820 270 C760 260 700 240 660 190 C630 150 600 90 640 60 Z" fill="var(--map-water)" />
        <g fill="none" stroke="var(--map-line)" strokeLinecap="round">
          <path d="M-10 300 C150 280 260 330 420 300 S700 230 860 260 S1100 330 1220 300" strokeWidth="3" />
          <path d="M200 -10 C230 120 180 240 240 360 S300 560 260 720" strokeWidth="2.5" />
          <path d="M520 -10 C540 140 600 220 580 360 S520 560 560 720" strokeWidth="2" />
          <path d="M880 -10 C860 120 940 250 920 380 S980 600 960 720" strokeWidth="2.5" />
          <path d="M-10 130 C200 160 380 100 560 140 S900 120 1220 160" strokeWidth="1.5" />
          <path d="M-10 450 C180 430 360 470 540 440 S860 420 1220 470" strokeWidth="1.5" />
          {Array.from({ length: 28 }, (_, i) => {
            const x = (i * 137) % 1200, y = (i * 263) % 700, l = 60 + ((i * 53) % 120), a = (i * 47) % 180;
            const r = (a * Math.PI) / 180;
            // rounded: Node and browsers disagree in the last float digit → hydration mismatch
            return <path key={i} d={`M${x} ${y} l${(Math.cos(r) * l).toFixed(1)} ${(Math.sin(r) * l).toFixed(1)}`} strokeWidth="1" opacity=".9" />;
          })}
        </g>
      </svg>
    </div>
  );
}
