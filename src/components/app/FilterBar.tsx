"use client";
import { navStart } from "@/components/app/RadarLoader";
import { LayoutGrid, List, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FilterPill } from "@/components/ui/FilterPill";
import { cn } from "@/components/ui/primitives";
import { DOMAIN_OPTIONS, GROUP_OPTIONS, LEVEL_OPTIONS, REGION_OPTIONS, WITHIN_OPTIONS } from "@/lib/filters";

/** Update one URL param (and reset paging / the open panel). */
function useParam() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    p.delete("page");
    p.delete("job");
    const s = p.toString();
    navStart();
    router.replace(`${path}${s ? `?${s}` : ""}`, { scroll: false });
  };
}

const csv = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function FilterBar({
  showSearch = false,
  showView = false,
  showTech = false,
  defaultView = "list",
  defaults = {},
  small = false,
}: {
  /** compact pills (half-width sections) */
  small?: boolean;
  showSearch?: boolean;
  showView?: boolean;
  showTech?: boolean;
  defaultView?: "list" | "cards";
  /** values used when the param is absent (so pills show the page's default state) */
  defaults?: { level?: string[]; region?: string[]; within?: string };
}) {
  const sp = useSearchParams();
  const path = usePathname();
  const set = useParam();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);
  const pick = (k: string, d: string[] = []) => (sp.has(k) ? csv(sp.get(k)) : d);
  const view = (sp.get("view") as "list" | "cards") ?? defaultView;
  const tech = sp.get("tech") !== "0";
  const anyFilter = ["q", "level", "region", "domain", "group", "within", "loc", "company", "tech"].some((k) => sp.has(k));

  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {showSearch && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: q.trim() || null });
            }}
            className="flex h-11 min-w-[220px] shrink-0 items-center gap-2 rounded-full bg-raised pl-5 pr-2 focus-within:ring-1 focus-within:ring-ink/20 md:w-[280px]"
          >
            <Search size={16} className="shrink-0 text-ink-2" />
            <input
              id="feed-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Role or company  ( / )"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => (setQ(""), set({ q: null }))} className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-raised">
                <X size={14} />
              </button>
            )}
          </form>
        )}
        <FilterPill size={small ? "sm" : "md"} label="Posted" value={pick("within", defaults.within ? [defaults.within] : [])} options={WITHIN_OPTIONS} onChange={(v) => set({ within: v[0] ?? (defaults.within ? "" : null) })} />
        <FilterPill size={small ? "sm" : "md"} label="Region" multi value={pick("region", defaults.region)} options={REGION_OPTIONS} onChange={(v) => set({ region: v.join(",") || (defaults.region?.length ? "" : null) })} />
        <FilterPill size={small ? "sm" : "md"} label="Level" multi value={pick("level", defaults.level)} options={LEVEL_OPTIONS} onChange={(v) => set({ level: v.join(",") || (defaults.level?.length ? "" : null) })} />
        <FilterPill size={small ? "sm" : "md"} label="Domain" multi value={pick("domain")} options={DOMAIN_OPTIONS} onChange={(v) => set({ domain: v.join(",") || null })} />
        <FilterPill size={small ? "sm" : "md"} label="Company group" value={pick("group")} options={GROUP_OPTIONS} onChange={(v) => set({ group: v[0] ?? null })} />
        {showTech && (
          <button
            type="button"
            role="switch"
            aria-checked={tech}
            onClick={() => set({ tech: tech ? "0" : null })}
            className="flex h-11 shrink-0 items-center gap-3 rounded-full bg-raised px-5 text-[14px]"
          >
            <span className={cn("relative h-6 w-10 rounded-full transition-colors", tech ? "bg-good" : "bg-chip")}>
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", tech ? "left-[18px]" : "left-0.5")} />
            </span>
            Tech only
          </button>
        )}
        {anyFilter && (
          <Link href={path} onClick={() => setQ("")} className="shrink-0 px-2 text-[14px] text-accent hover:underline">
            Reset
          </Link>
        )}
        {showView && (
          <div className="ml-auto flex shrink-0 rounded-full bg-raised p-1" role="group" aria-label="View">
            {(["list", "cards"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => set({ view: v === defaultView ? null : v })}
                className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-[14px]", view === v ? "bg-active text-active-ink" : "text-ink-2")}
              >
                {v === "list" ? <List size={15} /> : <LayoutGrid size={15} />}
                {v === "list" ? "List" : "Cards"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
