"use client";
/**
 * A visitor's own stars, hidden postings and pipeline — stored only in their browser (localStorage), never sent to
 * the server. Synced across tabs. Every read is defensive: storage can be blocked, full, or hand-edited.
 */
import { useSyncExternalStore } from "react";

export type LocalStage = "saved" | "applied" | "interview" | "offer" | "rejected";
export interface LocalSnap {
  id: string;
  title: string;
  company: string;
  domain: string | null;
  logo: string | null;
  url: string;
  deadline: number | null;
  postedTs: number | null;
}
export interface LocalState {
  starred: Record<string, number>;
  dismissed: Record<string, number>;
  hiddenCompanies: string[];
  stages: Record<string, { stage: LocalStage; at: number; appliedAt: number | null; snap: LocalSnap }>;
}

const KEY = "rx-local-v1";
const STAGES: LocalStage[] = ["saved", "applied", "interview", "offer", "rejected"];
const EMPTY: LocalState = { starred: {}, dismissed: {}, hiddenCompanies: [], stages: {} };
const MAX = 2000;

let state: LocalState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function validate(o: any): LocalState {
  if (!o || typeof o !== "object") return EMPTY;
  const rec = (r: unknown) => Object.fromEntries(Object.entries(r && typeof r === "object" ? r : {}).filter(([k, v]) => k.length <= 200 && typeof v === "number").slice(-MAX)) as Record<string, number>;
  const stages: LocalState["stages"] = {};
  for (const [id, v] of Object.entries(o.stages && typeof o.stages === "object" ? o.stages : {}).slice(-MAX) as [string, any][]) {
    if (!v || !STAGES.includes(v.stage) || !v.snap || id.length > 200) continue;
    const url = str(v.snap.url, 2000);
    stages[id] = {
      stage: v.stage,
      at: num(v.at) ?? Date.now(),
      appliedAt: num(v.appliedAt),
      snap: {
        id,
        title: str(v.snap.title, 300),
        company: str(v.snap.company, 200),
        domain: str(v.snap.domain, 200) || null,
        logo: /^https:\/\//.test(str(v.snap.logo, 2000)) ? str(v.snap.logo, 2000) : null,
        url: /^https?:\/\//.test(url) ? url : "",
        deadline: num(v.snap.deadline),
        postedTs: num(v.snap.postedTs),
      },
    };
  }
  return { starred: rec(o.starred), dismissed: rec(o.dismissed), hiddenCompanies: (Array.isArray(o.hiddenCompanies) ? o.hiddenCompanies : []).filter((x: unknown) => typeof x === "string").slice(0, 300), stages };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = validate(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    state = EMPTY;
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      state = validate(JSON.parse(e.newValue ?? "null"));
    } catch {
      state = EMPTY;
    }
    listeners.forEach((l) => l());
  });
}

function save(next: LocalState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked/full — keep it for this tab only */
  }
  listeners.forEach((l) => l());
}

export function useLocal(): LocalState {
  return useSyncExternalStore(
    (l) => {
      load();
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => (load(), state),
    () => EMPTY,
  );
}

export const local = {
  get: () => (load(), state),
  star(snap: LocalSnap, on: boolean) {
    const s = local.get();
    const starred = { ...s.starred };
    const stages = { ...s.stages };
    if (on) {
      starred[snap.id] = Date.now();
      if (!stages[snap.id]) stages[snap.id] = { stage: "saved", at: Date.now(), appliedAt: null, snap };
    } else {
      delete starred[snap.id];
      if (stages[snap.id]?.stage === "saved") delete stages[snap.id];
    }
    save({ ...s, starred, stages });
  },
  dismiss(id: string) {
    const s = local.get();
    save({ ...s, dismissed: { ...s.dismissed, [id]: Date.now() } });
  },
  undismiss(id: string) {
    const s = local.get();
    const dismissed = { ...s.dismissed };
    delete dismissed[id];
    save({ ...s, dismissed });
  },
  hideCompany(company: string) {
    const s = local.get();
    if (!s.hiddenCompanies.includes(company)) save({ ...s, hiddenCompanies: [...s.hiddenCompanies, company.slice(0, 200)] });
  },
  setStage(id: string, stage: LocalStage | null, snap?: LocalSnap) {
    const s = local.get();
    const stages = { ...s.stages };
    const starred = { ...s.starred };
    const cur = stages[id];
    if (stage === null) {
      delete stages[id];
      delete starred[id];
    } else {
      const sn = snap ?? cur?.snap;
      if (!sn) return;
      stages[id] = { stage, at: Date.now(), appliedAt: cur?.appliedAt ?? (stage !== "saved" ? Date.now() : null), snap: sn };
      starred[id] = starred[id] ?? Date.now();
    }
    save({ ...s, stages, starred });
  },
};

export function snapOf(j: { id: string; title: string; company: string; domain: string | null; logo: string | null; url: string; deadline?: number | null; freshTs?: number | null }): LocalSnap {
  return { id: j.id, title: j.title, company: j.company, domain: j.domain, logo: j.logo, url: j.url, deadline: j.deadline ?? null, postedTs: j.freshTs ?? null };
}
