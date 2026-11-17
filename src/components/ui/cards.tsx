import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BigNumber, cn } from "./primitives";

// ── Mini charts (SVG — Recharts is reserved for the full-size charts) ──────
export function MiniBars({ values, className, highlightLast = true }: { values: number[]; className?: string; highlightLast?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-10 items-end gap-[4px] border-b border-ink-3/50 pb-px", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full", highlightLast && i === values.length - 1 ? "bg-warn" : "bg-ink")}
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v === 0 ? 0.25 : 1 }}
        />
      ))}
    </div>
  );
}

export function Sparkline({ values, width = 110, height = 40, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 6 - ((v - min) / Math.max(1, max - min)) * (height - 14)]);
  // smooth with a simple Catmull-Rom → Bézier
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const peaks = pts.filter((p, i) => i > 0 && i < pts.length - 1 && p[1] < pts[i - 1][1] && p[1] < pts[i + 1][1]).slice(-2);
  return (
    <svg width={width} height={height} className={cn("overflow-visible text-ink", className)} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      {[...peaks, pts[pts.length - 1]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="currentColor" />
      ))}
    </svg>
  );
}

// ── StatCard (ref-01: title + chevron, content below) ──────────────────────
export function StatCard({
  title,
  href,
  children,
  className,
}: {
  title: ReactNode;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const head = (
    <header className="flex items-start justify-between gap-4">
      <h3 className="text-[16px] leading-tight tracking-[-0.015em]">{title}</h3>
      {href && <ChevronRight size={18} className="mt-0.5 shrink-0 text-ink-2 transition-transform group-hover:translate-x-0.5" />}
    </header>
  );
  return (
    <section className={cn("card group relative flex flex-col justify-between gap-5 p-5", className)}>
      {href ? (
        <Link href={href} aria-label={`Open ${typeof title === "string" ? title : "details"}`} className="after:absolute after:inset-0 after:rounded-card">
          {head}
        </Link>
      ) : (
        head
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, delta, size = "lg" }: { label?: string; value: ReactNode; delta?: ReactNode; size?: "md" | "lg" }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-[14px] text-ink-2">{label}</span>}
      <BigNumber value={value} delta={delta} size={size} />
    </div>
  );
}

// ── Spotlight card (was the For You gradient; ref-01 keeps colour for status only) ──
export function Waves({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 220" preserveAspectRatio="none" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full text-good", className)} aria-hidden>
      <path d="M0 220 L0 170 C60 160 110 150 150 110 C190 70 230 20 300 30 L300 220 Z" fill="currentColor" opacity=".06" />
      <path d="M0 220 L0 200 C70 195 120 180 170 140 C215 104 250 75 300 80 L300 220 Z" fill="currentColor" opacity=".05" />
      <path d="M150 110 C190 70 230 20 300 30" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth={1.2} />
    </svg>
  );
}

export function GradientCard({
  eyebrow,
  light,
  strong,
  href,
  children,
  className,
}: {
  eyebrow: string;
  light: string;
  strong: string;
  href?: string;
  children?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <Waves />
      <div className="relative flex items-center justify-between text-[15px]">
        <span className="flex items-center gap-2 text-good">
          <Sparkles size={15} /> {eyebrow}
        </span>
        <ChevronRight size={18} className="text-ink-2" />
      </div>
      <p className="relative mt-10 text-[24px] leading-[1.2] tracking-[-0.025em]">
        <span className="font-light text-ink-2">{light}</span>
        <br />
        <span>{strong}</span>
      </p>
      {children && <div className="relative mt-auto pt-6 text-ink-2">{children}</div>}
    </>
  );
  const cls = cn("card rx-lift relative flex min-h-[240px] flex-col overflow-hidden p-5", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <section className={cls}>{body}</section>
  );
}

// ── AlertRow (ref-01 warning rows) ─────────────────────────────────────────
type Severity = "critical" | "warning" | "info" | "good";
const SEV: Record<Severity, { dot: string; bg: string }> = {
  critical: { dot: "bg-bad", bg: "bg-bad/10 dark:bg-bad/[0.16]" },
  warning: { dot: "bg-warn", bg: "bg-warn/10 dark:bg-warn/[0.14]" },
  info: { dot: "bg-accent", bg: "bg-raised/60" },
  good: { dot: "bg-good", bg: "bg-good/10 dark:bg-good/[0.14]" },
};

export function AlertRow({
  severity,
  title,
  meta,
  href,
  trailing,
  dense,
}: {
  dense?: boolean;
  severity: Severity;
  title: ReactNode;
  meta?: ReactNode;
  href?: string;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <span className={cn("shrink-0 rounded-full", dense ? "mt-[3px] size-2.5" : "mt-1 size-3.5", SEV[severity].dot)} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-ink", dense ? "text-[13px]" : "text-[15px]")}>{title}</span>
        {meta && <span className={cn("block truncate text-ink-2", dense ? "text-[11px]" : "text-[13px]")}>{meta}</span>}
      </span>
      {trailing ?? (href && <ChevronRight size={dense ? 14 : 16} className="mt-0.5 shrink-0 text-ink-2" />)}
    </>
  );
  const cls = cn("flex items-start rounded-[14px] transition-colors", dense ? "gap-2.5 rounded-[11px] px-3 py-2" : "gap-3 px-4 py-3", SEV[severity].bg, href && "hover:brightness-110");
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
