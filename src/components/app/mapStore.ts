"use client";
import type * as maplibregl from "maplibre-gl";

/** Lets the hero's round map buttons drive the background map (they live in different subtrees). */
type Listener = (view: "india" | "world") => void;

let current: maplibregl.Map | null = null;
export type Pad = { top: number; bottom: number; left: number; right: number };
let pad: Pad | number = 8;
let view: "india" | "world" = "india";
const listeners = new Set<Listener>();

/** Which marker layers are visible: job pins, tech headlines, world-affairs headlines. */
export type MapLayer = "jobs" | "tech" | "world";
let layers = new Set<MapLayer>(["jobs", "tech", "world"]);
const layerListeners = new Set<(l: Set<MapLayer>) => void>();

export const mapStore = {
  set(m: maplibregl.Map, padding: Pad | number) {
    current = m;
    pad = padding;
  },
  clear(m: maplibregl.Map) {
    if (current === m) current = null;
  },
  get map() {
    return current;
  },
  get view() {
    return view;
  },
  setView(v: "india" | "world") {
    view = v;
    if (v === "india") current?.fitBounds([[68, 6], [98, 36]], { padding: pad, duration: 900 });
    else current?.fitBounds([[-125, -40], [150, 62]], { padding: pad, duration: 900 });
    listeners.forEach((l) => l(v));
  },
  get layers() {
    return layers;
  },
  setLayers(next: MapLayer[]) {
    layers = new Set(next);
    layerListeners.forEach((l) => l(layers));
  },
  onLayers(l: (l: Set<MapLayer>) => void) {
    layerListeners.add(l);
    return () => void layerListeners.delete(l);
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
