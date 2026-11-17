"use client";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { geocode } from "@/data/cities";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/components/ui/primitives";
import type { JobRow } from "@/lib/queries";
import { usePanel } from "./JobsView";

// ── Count pill (ref-01 "24 Bus · 100 Total") ────────────────────────────────
export function CountPill({ value, label, href }: { value: string | number; label: string; href: string }) {
  return (
    <Link href={href} className="flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-raised px-3.5 text-[13px] transition-colors hover:bg-chip">
      <span className="num">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</span>
      <span className="text-ink-2">{label}</span>
    </Link>
  );
}

/** Recharts generates random clip-path ids, so render charts only on the client (avoids a hydration mismatch). */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

// ── Dense volume histogram with step labels (ref-01 "Live Passenger Volume") ─
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

export function VolumeHistogram({ bars, weeks, className }: { bars: number[]; weeks: number[]; className?: string }) {
  const max = Math.max(1, ...bars);
  const minWeek = weeks.indexOf(Math.min(...weeks.filter((w) => w > 0)));
  const weekMax = Math.max(1, ...weeks);
  return (
    <div className={cn("relative w-full", className ?? "h-[120px]")}>
      <div className="absolute inset-0 flex items-end gap-px">
        {bars.map((n, i) => (
          <span key={i} className="flex-1 rounded-t-[1px] bg-ink-3/60" style={{ height: `${Math.max(2, (n / max) * 100)}%` }} />
        ))}
      </div>
      <div className="absolute inset-0 flex">
        {weeks.map((w, i) => {
          const hot = i === minWeek;
          return (
            <div key={i} className="relative flex-1 px-1">
              <div className="absolute inset-x-1" style={{ bottom: `${Math.max(14, (w / weekMax) * 78)}%` }}>
                <span className={cn("num block pb-1 text-[13px] font-light", hot ? "text-warn" : "text-ink")}>{k(w)}</span>
                <span className={cn("block h-[2px] rounded-full", hot ? "bg-warn" : "bg-ink")} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mini job card with a mini location map (ref-01 "Bus 6023" cards) ────────
const INDIA_BOX = { lon: [68, 98], lat: [6, 36] };
const WORLD_BOX = { lon: [-130, 150], lat: [-45, 65] };

function MiniMap({ location, region, small }: { location: string; region: string | null; small?: boolean }) {
  const city = geocode(location)[0];
  const box = city && city.lon > 68 && city.lon < 98 && city.lat > 6 && city.lat < 36 ? INDIA_BOX : WORLD_BOX;
  const x = city ? ((city.lon - box.lon[0]) / (box.lon[1] - box.lon[0])) * 100 : 50;
  const y = city ? (1 - (city.lat - box.lat[0]) / (box.lat[1] - box.lat[0])) * 100 : 50;
  const cx = Math.min(92, Math.max(14, x)), cy = Math.min(60, Math.max(16, y));
  const code = city ? city.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : region === "remote" ? "RMTE" : "—";
  return (
    <div className={cn("relative overflow-hidden rounded-[10px] bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:14px_14px]", small ? "h-[46px]" : "h-[70px]")}>
      {city && (
        <>
          <svg className="absolute inset-0 size-full" aria-hidden>
            {/* route-like L from the corner label to the city (line attrs accept %, polyline points don't) */}
            <line x1="8%" y1="70%" x2={`${cx}%`} y2="70%" stroke="var(--text)" strokeOpacity=".7" strokeWidth="1.5" />
            <line x1={`${cx}%`} y1="70%" x2={`${cx}%`} y2={`${cy}%`} stroke="var(--text)" strokeOpacity=".7" strokeWidth="1.5" />
          </svg>
          <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-card" style={{ left: `${cx}%`, top: `${cy}%` }} />
        </>
      )}
      <span className="absolute bottom-1.5 left-2 text-[11px] font-medium tracking-[0.04em]">{code}</span>
      <span className="absolute bottom-1.5 right-2 text-[11px] font-medium tracking-[0.04em] text-ink-2">{box === INDIA_BOX ? "IND" : region === "remote" ? "REMOTE" : "INTL"}</span>
    </div>
  );
}

export function MiniJobCard({ job, glass }: { job: JobRow; glass?: boolean }) {
  const open = usePanel();
  return (
    <button type="button" onClick={() => open(job.id)} className={cn("rx-lift flex min-w-0 flex-col text-left", glass ? "glass gap-2 p-3" : "card gap-3 p-4")}>
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate", glass ? "text-[13px]" : "text-[15px]")}>{job.company}</p>
          <p className={cn("truncate text-ink-2", glass ? "text-[11px]" : "text-[12px]")}>{job.title}</p>
        </div>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-2" />
      </div>
      <div className="flex items-center justify-between">
        <CompanyLogo name={job.company} domain={job.domain} logo={job.logo} size={glass ? 26 : 34} />
        <span className="num text-[12px] text-ink-2">{job.agoShort}</span>
      </div>
      <div className={cn("flex items-center justify-between", glass ? "text-[11px]" : "text-[12px]")}>
        <span className={job.isNew ? "text-good" : "text-ink-2"}>{job.isNew ? "New" : job.level === "newgrad" ? "New grad" : job.level === "research" ? "Research" : "Intern"}</span>
        {job.score != null ? <span className="num">↑ {job.score}%</span> : <span className="text-ink-2">{job.stipend ?? job.workplace ?? ""}</span>}
      </div>
      <MiniMap location={job.location} region={job.region} small={glass} />
    </button>
  );
}
