"use client";
import { safeHttpUrl } from "@/lib/url";
import { CalendarClock, ChevronLeft, ChevronRight, Globe2, LocateFixed, Minus, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterPill } from "@/components/ui/FilterPill";
import { IconButton, cn } from "@/components/ui/primitives";
import { MapBackdrop } from "@/components/ui/map";
import type { NewsItem, NewsPoint } from "@/lib/newsQueries";
import type { MapPoint } from "@/lib/queries";
import type { HazardView } from "@/lib/worldQueries";
import type { OutageView } from "@/lib/signalQueries";
import { mapStore, type MapLayer } from "./mapStore";

const LiveMap = dynamic(() => import("./LiveMap").then((m) => m.LiveMap), { ssr: false, loading: () => <MapBackdrop /> });

/**
 * Map canvas filling its (positioned) parent. `hero` = full-screen background on wide screens:
 * India is framed in the gap between the floating widget columns.
 */
/** Keep the previous reference while the content is equal — server refreshes send fresh arrays, which would rebuild the map (and lose the user's zoom). */
function useStable<T>(v: T): T {
  const ref = useRef<{ key: string; v: T } | null>(null);
  const key = JSON.stringify(v ?? null);
  if (!ref.current || ref.current.key !== key) ref.current = { key, v };
  return ref.current.v;
}

export function MapCanvas({ points: rawPoints, news: rawNews, hazards: rawHazards, outages: rawOutages, view, panelInset = 380, hero = false, selected = null }: { points: MapPoint[]; news?: NewsPoint[]; hazards?: HazardView[]; outages?: OutageView[]; view?: "india" | "world"; panelInset?: number; hero?: boolean; selected?: string | null }) {
  const points = useStable(rawPoints);
  const news = useStable(rawNews);
  const hazards = useStable(rawHazards);
  const outages = useStable(rawOutages);
  const [wide, setWide] = useState<boolean | null>(null);
  // the widget columns sit inside the 1920px content column; the hero map spans the whole viewport
  const [gutter, setGutter] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => {
      setWide(mq.matches);
      setGutter(Math.max(0, Math.round((window.innerWidth - 1920) / 2)));
    };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const pad = useMemo(() => (hero && wide ? { top: 200, bottom: 120, left: 400 + gutter, right: 380 + gutter } : undefined), [hero, wide, gutter]);
  if (wide === null) return <MapBackdrop />;
  return (
    <LiveMap
      key={String(wide)}
      points={points}
      news={news}
      hazards={hazards}
      outages={outages}
      selected={selected}
      view={view}
      pad={pad}
      rightInset={wide && !hero ? panelInset : 0}
      masked={false}
      compact={!wide || (!hero && panelInset === 0)}
      className="absolute inset-0"
    />
  );
}

/** ref-01 dropdown pills under the map title: region view + time window. */
export function MapViewPills({ withLayers = true }: { withLayers?: boolean }) {
  const [view, setView] = useState<"india" | "world">(() => mapStore.view);
  const [layers, setLayers] = useState<MapLayer[]>(() => [...mapStore.layers]);
  useEffect(() => mapStore.subscribe(setView), []);
  useEffect(() => mapStore.onLayers((l) => setLayers([...l])), []);
  return (
    <div className="flex flex-wrap gap-1.5">
      <div className="[&>div>button]:!bg-glass [&>div>button]:backdrop-blur-md" role="group" aria-label="Map view">
        <FilterPill
          size="sm"
          label="Region"
          value={[view]}
          options={[
            { value: "india", label: "India" },
            { value: "world", label: "World" },
          ]}
          onChange={(v) => v[0] && mapStore.setView(v[0] as "india" | "world")}
        />
      </div>
      {withLayers && (
        <div className="[&>div>button]:!bg-glass [&>div>button]:backdrop-blur-md" role="group" aria-label="Map layers">
          <FilterPill
            size="sm"
            label="No layers"
            multi
            value={layers}
            options={[
              { value: "jobs", label: "Jobs" },
              { value: "tech", label: "Tech" },
              { value: "world", label: "World" },
              { value: "hazards", label: "Hazards" },
              { value: "outages", label: "Internet outages" },
              { value: "cables", label: "Undersea cables" },
            ]}
            onChange={(v) => mapStore.setLayers(v as MapLayer[])}
          />
        </div>
      )}
      {withLayers && <Link href="/feed?within=24h" className="glass flex h-8 items-center gap-1.5 !rounded-full px-3 text-[12px] hover:bg-raised">
        <CalendarClock size={13} className="text-ink-2" /> Last 24 hours
      </Link>}
    </div>
  );
}

export function MapZoomControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-2 max-md:[&_button]:!size-10", className)}>
      <IconButton tone="glass" size={48} label="Zoom in" onClick={() => mapStore.map?.zoomIn({ duration: 300 })}>
        <Plus size={18} />
      </IconButton>
      <IconButton tone="glass" size={48} label="Recenter" onClick={() => mapStore.setView(mapStore.view)}>
        <LocateFixed size={18} />
      </IconButton>
      <IconButton tone="glass" size={48} label="Zoom out" onClick={() => mapStore.map?.zoomOut({ duration: 300 })}>
        <Minus size={18} />
      </IconButton>
      <IconButton tone="glass" size={48} label="Toggle India / World" onClick={() => mapStore.setView(mapStore.view === "india" ? "world" : "india")}>
        <Globe2 size={18} />
      </IconButton>
    </div>
  );
}

/** Small standalone map card (used by /design). */
export function HomeMap({ points }: { points: MapPoint[]; variant?: "background" | "card" }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-[18px] bg-raised ring-1 ring-line">
      <MapCanvas points={points} panelInset={0} />
    </div>
  );
}

/** Glass headline strip for the map: the biggest stories right now, auto-advancing. */
export function NewsTicker({ items, className }: { items: Pick<NewsItem, "id" | "title" | "url" | "sourceName" | "agoShort" | "kind" | "coverage" | "place">[]; className?: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [paused, items.length]);
  if (!items.length) return null;
  const it = items[i % items.length];
  const step = (d: number) => setI((n) => (n + d + items.length) % items.length);
  return (
    <div className={cn("glass flex h-12 items-center gap-3 !rounded-full pl-4 pr-1.5", className)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2">
        <span className={cn("block size-2 rotate-45 rounded-[1px]", it.kind === "tech" ? "bg-accent" : "bg-[#b18cff]")} />
        {it.kind === "tech" ? "Tech" : "World"}
      </span>
      <a key={it.id} href={safeHttpUrl(it.url) ?? "#"} target="_blank" rel="noreferrer" className="rx-fade-up min-w-0 flex-1 truncate text-[14px] hover:underline">
        {it.title}
      </a>
      <span className="num hidden shrink-0 text-[12px] text-ink-2 2xl:inline">
        {it.sourceName}
        {it.coverage > 1 ? ` +${it.coverage - 1}` : ""} · {it.agoShort}
      </span>
      <span className="flex shrink-0">
        <button type="button" aria-label="Previous headline" onClick={() => step(-1)} className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink">
          <ChevronLeft size={16} />
        </button>
        <button type="button" aria-label="Next headline" onClick={() => step(1)} className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink">
          <ChevronRight size={16} />
        </button>
      </span>
    </div>
  );
}
