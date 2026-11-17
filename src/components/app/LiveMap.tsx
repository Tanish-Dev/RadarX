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

const visible = (kind: "jobs" | NewsPoint["kind"], on: Set<MapLayer>) => (kind === "mixed" ? on.has("tech") || on.has("world") : on.has(kind));

/**
 * MapLibre map of postings from the last 24h. `rightInset` keeps India inside the
 * part of the map that isn't covered by the stat cards (background variant).
 */
export function LiveMap({
  points,
  news = [],
  view = "india",
  rightInset = 0,
  pad,
  compact = false,
  masked = true,
  className,
  interactive = true,
}: {
  points: MapPoint[];
  /** headlines grouped by place (tech + world affairs) */
  news?: NewsPoint[];
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
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!ref.current) return;
    let map: maplibregl.Map;
    const fitPad = pad ?? (compact ? 8 : { top: 80, bottom: 60, left: 40, right: rightInset });
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: isDark() ? STYLE.dark : STYLE.light,
        bounds: view === "world" ? WORLD : INDIA,
        fitBoundsOptions: { padding: fitPad },
        attributionControl: { compact: true },
        scrollZoom: false, // never hijack page scroll
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
    if (mapStore.view !== view) map.once("load", () => mapStore.setView(view)); // sync the Region pill

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
    const applyLayers = (on: Set<MapLayer>) => {
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
      markers.forEach((m) => m.remove());
      newsMarkers.forEach((m) => m.marker.remove());
      mapStore.clear(map);
      map.remove();
    };
  }, [points, news, view, rightInset, pad, compact, interactive, router]);

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
