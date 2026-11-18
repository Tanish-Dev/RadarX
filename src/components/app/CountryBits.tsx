import Link from "next/link";
import { cn } from "@/components/ui/primitives";
import { BAND_LABEL, type Band } from "@/lib/instability";
import type { BoardRow } from "@/lib/countryQueries";

export const BAND_TONE: Record<Band, { text: string; bar: string }> = {
  low: { text: "text-good", bar: "bg-good" },
  guarded: { text: "text-accent", bar: "bg-accent" },
  elevated: { text: "text-warn", bar: "bg-warn" },
  high: { text: "text-bad", bar: "bg-bad" },
  critical: { text: "text-bad", bar: "bg-bad" },
};

export function Delta({ delta, className }: { delta: number | null; className?: string }) {
  if (delta == null) return <span className={cn("num text-[12px] text-ink-3", className)} title="Needs ~3 days of RadarX news history">24h —</span>;
  const flat = Math.abs(delta) < 2;
  return (
    <span className={cn("num text-[12px]", flat ? "text-ink-2" : delta > 0 ? "text-bad" : "text-good", className)} title="Change in score vs 24 hours ago">
      {flat ? "→ 0" : delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`} <span className="text-ink-3">24h</span>
    </span>
  );
}

/** 0–100 score with a band-coloured bar; the three components are the segments' tooltip. */
export function ScoreMeter({ row, size = "md" }: { row: Pick<BoardRow, "score">; size?: "sm" | "md" | "lg" }) {
  const { score } = row;
  const tone = BAND_TONE[score.band];
  return (
    <div className="min-w-0" title={`Unrest ${score.unrest}/60 · Hazards ${score.hazard}/25 · News attention ${score.attention}/15`}>
      <div className="flex items-baseline gap-2">
        <span className={cn("num font-light leading-none tracking-[-0.04em]", size === "lg" ? "text-[56px]" : size === "md" ? "text-[28px]" : "text-[20px]")}>{score.total}</span>
        <span className={cn("text-[12px]", tone.text)}>{BAND_LABEL[score.band]}</span>
      </div>
      <div className={cn("mt-2 overflow-hidden rounded-full bg-chip", size === "sm" ? "h-1" : "h-1.5")}>
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.max(3, score.total)}%` }} />
      </div>
    </div>
  );
}

/** Compact country tile for the /world board: flag, score, why, and what it means for the user's roles. */
export function CountryTile({ row }: { row: BoardRow }) {
  return (
    <Link href={`/world/${row.country.iso}`} className="card rx-lift flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[15px]">
          <span aria-hidden className="text-[20px] leading-none">{row.country.flag}</span>
          <span className="truncate">{row.country.name}</span>
        </span>
        <Delta delta={row.delta} />
      </div>
      <ScoreMeter row={row} size="sm" />
      <p className="line-clamp-2 min-h-[2.4em] text-[12px] leading-snug text-ink-2">{row.topHeadline ?? "No recent headlines."}</p>
      <p className="num flex items-center justify-between border-t border-line pt-2 text-[12px] text-ink-2">
        <span>{row.roles ? `${row.roles.toLocaleString("en-IN")} tech roles` : "no open roles"}</span>
        {row.early > 0 && <span className="text-good">{row.early} early-career</span>}
      </p>
    </Link>
  );
}
