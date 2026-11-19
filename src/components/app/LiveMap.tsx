"use client";
import { navStart } from "@/components/app/RadarLoader";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CITIES } from "@/data/cities";
import { MapBackdrop } from "@/components/ui/map";
import type { NewsPoint } from "@/lib/newsQueries";
import type { MapPoint } from "@/lib/queries";
import type { HazardView } from "@/lib/worldQueries";
import type { OutageView } from "@/lib/signalQueries";
import { mapStore, type MapLayer, type Pad } from "./mapStore";

/**
 * Light: OpenFreeMap positron (free, keyless vector tiles).
 * Dark: grayscale satellite — EOX Sentinel-2 cloudless imagery (free, keyless; CC BY-NC-SA 4.0,
 * fine for this personal non-commercial app, attribution shown) darkened a little so markers and
 * floating panels stay readable, with country borders + English city names from OpenFreeMap on top.
 * Both verified 2026-11-17.
 */
const SATELLITE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    s2: {
      type: "raster",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg"],
      tileSize: 256,
      maxzoom: 14,
      attribution:
        '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2021)',
    },
    omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © OpenStreetMap' },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0a0a0b" } },
    { id: "s2", type: "raster", source: "s2", paint: { "raster-brightness-max": 0.62, "raster-saturation": -1, "raster-contrast": 0.12 } }, // grayscale
    {
      id: "borders",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": "rgba(255,255,255,0.4)", "line-width": 0.9 },
    },
    {
      id: "place_city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: ["==", ["get", "class"], "city"],
      layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": "rgba(255,255,255,0.75)", "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1.2 },
    },
  ],
};
const STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: SATELLITE };
const INDIA: [[number, number], [number, number]] = [[68, 6], [98, 36]];
const WORLD: [[number, number], [number, number]] = [[-125, -40], [150, 62]];
// served from public/ (scripts/copy-maplibre-worker.mjs) — the bundler can't resolve MapLibre's own worker URL
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const isDark = () => document.documentElement.classList.contains("dark");

/** Feed `loc` filter for a city, including its common aliases ("Bengaluru|Bangalore"). */
function locParam(city: string) {
  const row = CITIES.find((c) => c[0] === city);
  const aliases = (row?.slice(3) as string[] | undefined)?.filter((a) => a.length > 3).slice(0, 2) ?? [];
  return [city, ...aliases].join("|");
}

/** Build marker DOM with createElement/textContent only — no job data is parsed as HTML. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const el = document.createElement(tag);
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function markerEl(p: MapPoint): HTMLElement {
  // MapLibre positions the outer element with an inline `transform`; any animation that touches
  // transform (rx-drop) must live on an inner element or every marker snaps to (0,0).
  const el = h("button", "cursor-pointer");
  el.type = "button";
  el.setAttribute("aria-label", `${p.count} new role${p.count === 1 ? "" : "s"} in ${p.city}`);
  const fresh = p.newest.minutes < 15 ? " rx-pulse" : "";
  const inner = h("span", "");
  el.append(inner);
  if (p.count >= 3) {
    inner.className = `rx-drop flex items-center justify-center rounded-full bg-warn/20 p-[6px]${fresh}`;
    inner.append(h("span", "num flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-warn bg-card px-1.5 text-[11px] font-medium text-ink", p.count > 999 ? "999+" : String(p.count)));
    return el;
  }
  inner.className = `rx-drop flex rounded-full bg-card p-1 shadow-pop${fresh}`;
  const letter = p.top.company.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?";
  const badge = h("span", "flex size-8 items-center justify-center overflow-hidden rounded-full bg-card ring-1 ring-line");
  const src = p.top.logo || (p.top.domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(p.top.domain)}&sz=64` : "");
  if (src) {
    const img = h("img", p.top.logo ? "size-full object-cover" : "size-5 rounded-[3px]");
    img.alt = "";
    img.src = src;
    img.addEventListener("error", () => img.replaceWith(h("span", "text-[13px] font-medium", letter)));
    badge.append(img);
  } else {
    badge.className = "flex size-8 items-center justify-center rounded-full bg-accent text-[13px] font-medium text-white";
    badge.textContent = letter;
  }
  inner.append(badge);
  return el;
}

function popupHtml(p: MapPoint) {
  return `<div class="w-60 max-w-[70vw]">
    <div class="flex items-baseline justify-between gap-3"><span class="truncate text-[15px] font-medium">${esc(p.city)}</span><span class="num shrink-0 text-[12px] text-good">${esc(p.newest.ago)}</span></div>
    <p class="mt-1 truncate text-[13px]">${esc(p.newest.title)}</p>
    <p class="truncate text-[12px] text-ink-2">${esc(p.newest.company)}</p>
    <p class="num mt-2 text-[12px] text-ink-3">${p.count} new tech role${p.count === 1 ? "" : "s"} · click to open</p>
  </div>`;
}

const KIND_DOT: Record<NewsPoint["kind"], string> = {
  tech: "bg-accent",
  world: "bg-[#b18cff]",
  mixed: "bg-[linear-gradient(135deg,var(--accent)_50%,#b18cff_50%)]",
};

/** News marker: a diamond + story count in a small pill — visibly different from the round job pins. */
function newsMarkerEl(p: NewsPoint): HTMLElement {
  const el = h("button", "cursor-pointer");
  el.type = "button";
  el.setAttribute("aria-label", `${p.count} news ${p.count === 1 ? "story" : "stories"} in ${p.place}`);
  const inner = h("span", `rx-drop flex items-center gap-1.5 rounded-full bg-card/90 py-1 pl-2 shadow-pop ring-1 ring-line pr-2 backdrop-blur-sm${p.newestMinutes < 30 ? " rx-pulse" : ""}`);
  inner.append(h("span", `block size-2.5 rotate-45 rounded-[2px] ${KIND_DOT[p.kind]}`));
  if (p.count > 1) inner.append(h("span", "num text-[11px] font-medium text-ink", p.count > 99 ? "99+" : String(p.count)));
  el.append(inner);
  return el;
}

function newsPopupHtml(p: NewsPoint) {
  const rows = p.items
    .map(
      (it) => `<li class="flex gap-2 border-t border-line py-1.5 first:border-t-0">
        <span class="mt-[5px] block size-2 shrink-0 rotate-45 rounded-[1px] ${KIND_DOT[it.kind]}"></span>
        <span class="min-w-0"><span class="line-clamp-2 text-[13px] leading-snug">${esc(it.title)}</span>
        <span class="num block text-[11px] text-ink-2">${esc(it.source)} · ${esc(it.ago)}${it.coverage > 1 ? ` · ${it.coverage} outlets` : ""}</span></span>
      </li>`,
    )
    .join("");
  return `<div class="w-72 max-w-[70vw]">
    <div class="flex items-baseline justify-between gap-3"><span class="truncate text-[15px] font-medium">${esc(p.place)}</span><span class="num shrink-0 text-[12px] text-ink-2">${p.count} stor${p.count === 1 ? "y" : "ies"}</span></div>
    <ul class="mt-1.5">${rows}</ul>
    <p class="mt-1 text-[11px] text-ink-3">click to read all</p>
  </div>`;
}

const HAZARD_LABEL: Record<HazardView["kind"], string> = { quake: "Earthquake", storm: "Storm", wildfire: "Wildfire", volcano: "Volcano", flood: "Flood", other: "Event" };
const HAZARD_COLOR: Record<HazardView["kind"], string> = { quake: "#ff6b57", storm: "#5ab0ff", wildfire: "#ff9f1c", volcano: "#ff4d8d", flood: "#4dd4c4", other: "#b0b0b8" };

/** Hazard marker: a ring (pulsing when recent) sized by severity, coloured by kind; quakes show the magnitude. */
function hazardMarkerEl(hz: HazardView): HTMLElement {
  const el = h("button", "cursor-pointer");
  el.type = "button";
  el.setAttribute("aria-label", `${HAZARD_LABEL[hz.kind]}: ${hz.title}, ${hz.ago}`);
  const size = 14 + hz.severity * 6;
  const inner = h("span", `rx-drop flex items-center justify-center rounded-full border-2 bg-card/70 backdrop-blur-[2px]${Date.now() - hz.ts < 3 * 3_600_000 ? " rx-pulse" : ""}`);
  inner.style.cssText = `width:${size}px;height:${size}px;border-color:${HAZARD_COLOR[hz.kind]};opacity:${hz.severity === 1 ? 0.8 : 1}`;
  if (hz.mag != null && hz.severity > 1) inner.append(h("span", "num text-[10px] font-medium text-ink", hz.mag.toFixed(1)));
  el.append(inner);
  return el;
}

function hazardPopupHtml(h: HazardView) {
  return `<div class="w-60 max-w-[70vw]">
    <div class="flex items-baseline justify-between gap-3"><span class="text-[13px]" style="color:${HAZARD_COLOR[h.kind]}">${esc(HAZARD_LABEL[h.kind])}${h.mag != null ? ` · M${h.mag.toFixed(1)}` : ""}</span><span class="num shrink-0 text-[12px] text-ink-2">${esc(h.ago)}</span></div>
    <p class="mt-1 text-[13px] leading-snug">${esc(h.title)}</p>
    <p class="mt-2 text-[11px] text-ink-3">click for details</p>
  </div>`;
}

const OUTAGE_COLOR: Record<OutageView["level"], string> = { major: "#ff5a6e", moderate: "#ffb020", minor: "#9aa0aa" };

/** Outage marker: a square "signal lost" chip at the country centre — distinct from round hazards and diamond news. */
function outageMarkerEl(o: OutageView): HTMLElement {
  const el = h("button", "cursor-pointer");
  el.type = "button";
  el.setAttribute("aria-label", `Internet outage in ${o.name}, ${o.level}, ${o.hours} hours`);
  const inner = h("span", "rx-drop flex items-center gap-1 rounded-[6px] bg-card/90 px-1.5 py-[3px] shadow-pop ring-1 backdrop-blur-sm");
  inner.style.setProperty("--tw-ring-color", OUTAGE_COLOR[o.level]);
  const bars = h("span", "flex items-end gap-[1.5px]");
  for (const [i, ht] of [4, 7, 10].entries()) {
    const b = h("span", "block w-[2.5px] rounded-[1px]");
    b.style.cssText = `height:${ht}px;background:${i === 0 ? OUTAGE_COLOR[o.level] : "rgba(140,140,150,.45)"}`;
    bars.append(b);
  }
  inner.append(bars, h("span", "text-[10px] font-medium text-ink", o.iso));
  el.append(inner);
  return el;
}

function outagePopupHtml(o: OutageView) {
  return `<div class="w-60 max-w-[70vw]">
    <div class="flex items-baseline justify-between gap-3"><span class="text-[13px]" style="color:${OUTAGE_COLOR[o.level]}">Internet outage · ${esc(o.level)}</span><span class="num shrink-0 text-[12px] text-ink-2">${o.hours}h</span></div>
    <p class="mt-1 text-[14px]">${esc(o.flag)} ${esc(o.name)}</p>
    <p class="mt-1 text-[12px] text-ink-2">Seen by ${esc(o.signals.join(", "))} · since ${esc(o.since)}</p>
    <p class="mt-2 text-[11px] text-ink-3">IODA (Georgia Tech) · click for the country briefing</p>
  </div>`;
}

/** Submarine cables as a line layer; re-added after every style swap (theme toggle wipes custom layers). */
let cablesData: Promise<GeoJSON.FeatureCollection | null> | null = null;
const loadCables = () => (cablesData ??= fetch("/api/cables").then((r) => (r.ok ? r.json() : null)).catch(() => null));
async function ensureCables(map: maplibregl.Map, on: boolean) {
  if (map.getLayer("cables")) {
    map.setLayoutProperty("cables", "visibility", on ? "visible" : "none");
    return;
  }
  if (!on) return;
  const data = await loadCables();
  if (!data || !map.getStyle() || map.getLayer("cables")) return;
  if (!map.getSource("cables")) map.addSource("cables", { type: "geojson", data, attribution: '<a href="https://www.submarinecablemap.com" target="_blank" rel="noreferrer">TeleGeography</a>' });
  map.addLayer({ id: "cables", type: "line", source: "cables", paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.6], "line-opacity": 0.7 } });
}

/** Open a country's briefing as a slide-over on Home (`?country=IN`), keeping Home's other params. */
export function countryHref(iso: string) {
  const here = new URL(window.location.href);
  const p = here.pathname === "/" ? new URLSearchParams(here.search) : new URLSearchParams();
  p.delete("job");
  p.set("country", iso.toUpperCase());
  return `/?${p}`;
}

/**
 * Country shapes (Natural Earth 1:110m, public domain; built by scripts/build-countries.mjs) for hover + select.
 * Invisible until hovered/selected; re-added after every style swap.
 */
let countriesData: Promise<GeoJSON.FeatureCollection | null> | null = null;
const loadCountries = () => (countriesData ??= fetch("/countries-110m.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));
async function ensureCountries(map: maplibregl.Map, selected: string | null) {
  const data = await loadCountries();
  if (!data || !map.getStyle()) return;
  if (!map.getSource("countries")) map.addSource("countries", { type: "geojson", data, promoteId: "iso" });
  // under labels/borders so the satellite borders and city names stay crisp
  const before = map.getStyle().layers?.find((l) => l.type === "symbol" || l.id === "borders")?.id;
  const state = (k: string) => ["boolean", ["feature-state", k], false];
  if (!map.getLayer("countries-fill")) {
    map.addLayer(
      {
        id: "countries-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": isDark() ? "#ffffff" : "#1a6bff",
          "fill-opacity": ["case", state("selected"), isDark() ? 0.16 : 0.14, state("hover"), isDark() ? 0.09 : 0.08, 0] as any,
        },
      },
      before,
    );
  }
  if (!map.getLayer("countries-line")) {
    map.addLayer(
      {
        id: "countries-line",
        type: "line",
        source: "countries",
        paint: {
          "line-color": isDark() ? "#ffffff" : "#1a6bff",
          "line-width": ["case", state("selected"), 1.8, 1.1] as any,
          "line-opacity": ["case", state("selected"), 0.95, state("hover"), 0.6, 0] as any,
        },
      },
      before,
    );
  }
  if (selected) map.setFeatureState({ source: "countries", id: selected }, { selected: true });
}

/**
 * Trackpad-friendly gestures: two-finger swipe pans, pinch (ctrl+wheel in Chrome/Firefox, gesture events in Safari)
 * zooms around the cursor; a real mouse wheel zooms. Returns a cleanup.
 */
function trackpadGestures(map: maplibregl.Map) {
  const box = map.getCanvasContainer();
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.getBoundingClientRect();
    return map.unproject([e.clientX - r.left, e.clientY - r.top]);
  };
  const zoomBy = (dz: number, e: { clientX: number; clientY: number }) => {
    const z = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + dz));
    map.easeTo({ zoom: z, around: at(e), duration: 0 });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    // Chrome/Safari report trackpads with wheelDeltaY = -3 × deltaY; Firefox mice scroll in lines
    const mouse = e.deltaMode === 1 || (legacy != null && legacy !== 0 && legacy !== -3 * e.deltaY && Math.abs(legacy) % 120 === 0);
    if (e.ctrlKey) zoomBy(-e.deltaY * 0.012, e);
    else if (mouse) zoomBy(-(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * 0.003, e);
    else map.panBy([e.deltaX, e.deltaY], { duration: 0 });
  };
  let startZoom = 0;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    startZoom = map.getZoom();
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const z = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), startZoom + Math.log2(g.scale)));
    map.easeTo({ zoom: z, around: at(g), duration: 0 });
  };
  box.addEventListener("wheel", onWheel, { passive: false });
  box.addEventListener("gesturestart", onGestureStart, { passive: false } as AddEventListenerOptions);
  box.addEventListener("gesturechange", onGestureChange, { passive: false } as AddEventListenerOptions);
  return () => {
    box.removeEventListener("wheel", onWheel);
    box.removeEventListener("gesturestart", onGestureStart);
    box.removeEventListener("gesturechange", onGestureChange);
  };
}

const visible = (kind: "jobs" | NewsPoint["kind"], on: Set<MapLayer>) => (kind === "mixed" ? on.has("tech") || on.has("world") : on.has(kind));

/**
 * MapLibre map of postings from the last 24h. `rightInset` keeps India inside the
 * part of the map that isn't covered by the stat cards (background variant).
 */
export function LiveMap({
  points,
  news = [],
  hazards = [],
  outages = [],
  view = "india",
  rightInset = 0,
  pad,
  compact = false,
  masked = true,
  className,
  interactive = true,
  selected = null,
}: {
  points: MapPoint[];
  /** headlines grouped by place (tech + world affairs) */
  news?: NewsPoint[];
  /** earthquakes + natural events */
  hazards?: HazardView[];
  /** ongoing country-level internet outages (IODA) */
  outages?: OutageView[];
  /** initial framing */
  view?: "india" | "world";
  rightInset?: number;
  /** explicit fit padding (full-screen hero: keep India between the floating widget columns) */
  pad?: Pad;
  compact?: boolean;
  /** fade the edges (background use); panels show the map edge-to-edge */
  masked?: boolean;
  className?: string;
  interactive?: boolean;
  /** ISO-2 of the country whose briefing is open — outlined on the map */
  selected?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!ref.current) return;
    let map: maplibregl.Map;
    const fitPad = pad ?? (compact ? 8 : { top: 80, bottom: 60, left: 40, right: rightInset });
    const page = window.location.pathname;
    const saved = mapStore.camera(page);
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: isDark() ? STYLE.dark : STYLE.light,
        ...(saved ? { center: saved.center, zoom: saved.zoom } : { bounds: view === "world" ? WORLD : INDIA, fitBoundsOptions: { padding: fitPad } }),
        attributionControl: { compact: true },
        scrollZoom: false, // replaced by trackpadGestures (two-finger pan, pinch zoom)
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: false,
        interactive,
      });
    } catch {
      setFailed(true); // no WebGL
      return;
    }
    mapStore.set(map, fitPad);
    if (!saved && mapStore.view !== view) map.once("load", () => mapStore.setView(view)); // sync the Region pill
    map.on("moveend", () => mapStore.saveCamera(page, map));

    const markers = points.map((p) => {
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "none", offset: 22, className: "rx-popup" }).setHTML(popupHtml(p));
      const el = markerEl(p);
      el.addEventListener("mouseenter", () => popup.setLngLat([p.lon, p.lat]).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("focus", () => popup.setLngLat([p.lon, p.lat]).addTo(map));
      el.addEventListener("blur", () => popup.remove());
      el.addEventListener("click", () => (navStart(), router.push(`/feed?within=24h&loc=${encodeURIComponent(locParam(p.city))}`)));
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    });

    // where a city has both, nudge the news pill below the job badge so neither hides the other
    const jobCities = new Set(points.map((p) => `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`));
    const newsMarkers = news.map((p) => {
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "none", offset: 16, className: "rx-popup" }).setHTML(newsPopupHtml(p));
      const el = newsMarkerEl(p);
      el.addEventListener("mouseenter", () => popup.setLngLat([p.lon, p.lat]).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("focus", () => popup.setLngLat([p.lon, p.lat]).addTo(map));
      el.addEventListener("blur", () => popup.remove());
      el.addEventListener("click", () => (navStart(), router.push(`/news?place=${encodeURIComponent(p.place)}`)));
      const shared = jobCities.has(`${p.lat.toFixed(1)},${p.lon.toFixed(1)}`);
      return { kind: p.kind, el, marker: new maplibregl.Marker({ element: el, offset: shared ? [0, 30] : [0, 0] }).setLngLat([p.lon, p.lat]).addTo(map) };
    });
    const hazardMarkers = hazards.map((hz) => {
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "none", offset: 14, className: "rx-popup" }).setHTML(hazardPopupHtml(hz));
      const el = hazardMarkerEl(hz);
      el.addEventListener("mouseenter", () => popup.setLngLat([hz.lon, hz.lat]).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("focus", () => popup.setLngLat([hz.lon, hz.lat]).addTo(map));
      el.addEventListener("blur", () => popup.remove());
      el.addEventListener("click", () => {
        if (hz.url && /^https?:\/\//.test(hz.url)) window.open(hz.url, "_blank", "noopener,noreferrer");
      });
      return new maplibregl.Marker({ element: el }).setLngLat([hz.lon, hz.lat]).addTo(map);
    });
    const outageMarkers = outages.filter((o) => o.lat != null && o.lon != null).map((o) => {
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "none", offset: 14, className: "rx-popup" }).setHTML(outagePopupHtml(o));
      const el = outageMarkerEl(o);
      const at: [number, number] = [o.lon!, o.lat!];
      el.addEventListener("mouseenter", () => popup.setLngLat(at).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("focus", () => popup.setLngLat(at).addTo(map));
      el.addEventListener("blur", () => popup.remove());
      el.addEventListener("click", () => (navStart(), router.push(countryHref(o.iso), { scroll: false })));
      // sit just under the country centre so it doesn't cover a capital's job badge
      return new maplibregl.Marker({ element: el, offset: [0, 18] }).setLngLat(at).addTo(map);
    });
    const applyLayers = (on: Set<MapLayer>) => {
      for (const m of outageMarkers) m.getElement().style.display = on.has("outages") ? "" : "none";
      if (map.isStyleLoaded()) void ensureCables(map, on.has("cables"));
      for (const m of hazardMarkers) m.getElement().style.display = on.has("hazards") ? "" : "none";
      for (const m of markers) m.getElement().style.display = visible("jobs", on) ? "" : "none";
      for (const m of newsMarkers) m.el.style.display = visible(m.kind, on) ? "" : "none";
    };
    applyLayers(mapStore.layers);
    const offLayers = mapStore.onLayers(applyLayers);

    // ref-00 wants a quiet map: hide labels except city names, which stay faint
    const quiet = () => {
      if (isDark()) return; // the satellite style is already minimal
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.type !== "symbol") continue;
        if (/place_city|place-city|city/i.test(layer.id)) {
          map.setPaintProperty(layer.id, "text-opacity", 0.55);
          map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]);
        } else {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    };
    map.on("style.load", quiet);
    map.on("style.load", () => void ensureCables(map, mapStore.layers.has("cables")));
    map.on("style.load", () => void ensureCountries(map, selectedRef.current));
    mapRef.current = map;

    // hover a country → outline + name; click → its briefing
    let hovered: string | null = null;
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "none", offset: 12, className: "rx-popup" });
    const setHover = (iso: string | null) => {
      if (hovered === iso) return;
      if (hovered && map.getSource("countries")) map.setFeatureState({ source: "countries", id: hovered }, { hover: false });
      hovered = iso;
      if (iso && map.getSource("countries")) map.setFeatureState({ source: "countries", id: iso }, { hover: true });
    };
    if (interactive) {
      // a marker (job, story, hazard, outage) or its popup sits on top: let it own the hover, no country tooltip
      const overMarker = (ev: Event | undefined) => ev?.target instanceof Element && !!ev.target.closest(".maplibregl-marker, .maplibregl-popup");
      const clearCountryHover = () => {
        setHover(null);
        map.getCanvas().style.cursor = "";
        tip.remove();
      };
      map.on("mousemove", "countries-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        if (overMarker(e.originalEvent)) return clearCountryHover();
        const iso = String(f.properties?.iso ?? f.id);
        setHover(iso);
        map.getCanvas().style.cursor = "pointer";
        tip.setLngLat(e.lngLat).setHTML(`<div class="text-[13px]">${esc(String(f.properties?.name ?? iso))}<span class="ml-2 text-[11px] text-ink-3">click for briefing</span></div>`).addTo(map);
      });
      map.on("mouseleave", "countries-fill", () => {
        setHover(null);
        map.getCanvas().style.cursor = "";
        tip.remove();
      });
      map.on("click", "countries-fill", (e) => {
        const iso = e.features?.[0]?.properties?.iso;
        if (typeof iso !== "string" || overMarker(e.originalEvent)) return;
        tip.remove();
        // the briefing slides over the right side — if the tap landed there, slide the country into view
        const w = window.innerWidth;
        const panel = w >= 1024 ? Math.max(520, 0.38 * w) + 12 : w >= 640 ? Math.min(600, w - 24) + 12 : 0;
        const cw = map.getCanvas().clientWidth;
        const free = cw - panel;
        if (panel && free > 240 && e.point.x > free - 60) map.panBy([e.point.x - free / 2, 0], { duration: 500 });
        navStart();
        router.push(countryHref(iso), { scroll: false });
      });
    }
    const onEnterMarker = (ev: Event) => {
      if (ev.target instanceof Element && ev.target.closest(".maplibregl-marker")) {
        setHover(null);
        tip.remove();
      }
    };
    map.getCanvasContainer().addEventListener("mouseover", onEnterMarker);
    const offGestures = interactive ? trackpadGestures(map) : () => {};
    // start with the attribution collapsed to its (i) button — it covers the controls on phones
    map.once("load", () => ref.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));

    // follow the app theme
    const obs = new MutationObserver(() => map.setStyle(isDark() ? STYLE.dark : STYLE.light));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    map.on("error", (e) => {
      if (String(e.error?.message ?? "").includes("WebGL")) setFailed(true);
    });

    return () => {
      obs.disconnect();
      offLayers();
      offGestures();
      map.getCanvasContainer().removeEventListener("mouseover", onEnterMarker);
      tip.remove();
      mapRef.current = null;
      markers.forEach((m) => m.remove());
      newsMarkers.forEach((m) => m.marker.remove());
      hazardMarkers.forEach((m) => m.remove());
      outageMarkers.forEach((m) => m.remove());
      mapStore.clear(map);
      map.remove();
    };
  }, [points, news, hazards, outages, view, rightInset, pad, compact, interactive, router]);

  // outline the selected country without rebuilding the map
  useEffect(() => {
    const prev = selectedRef.current;
    selectedRef.current = selected;
    const map = mapRef.current;
    if (!map?.getSource("countries")) return;
    if (prev && prev !== selected) map.setFeatureState({ source: "countries", id: prev }, { selected: false });
    if (selected) map.setFeatureState({ source: "countries", id: selected }, { selected: true });
  }, [selected]);

  if (failed) return <MapBackdrop className={className} />;
  // maplibre-gl.css forces `.maplibregl-map { position: relative }`, so positioning lives on a wrapper
  return (
    <div
      className={className}
      style={
        masked
          ? { opacity: 0.85, maskImage: "radial-gradient(ellipse 90% 80% at 40% 42%, #000 50%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 40% 42%, #000 50%, transparent 100%)" }
          : undefined
      }
    >
      <div ref={ref} className="size-full" />
    </div>
  );
}
