"use client";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./primitives";

export interface Option {
  value: string;
  label: string;
}

/** Close on outside click / Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Menu({ options, selected, onPick, multi }: { options: Option[]; selected: string[]; onPick: (v: string) => void; multi?: boolean }) {
  return (
    <div role="listbox" aria-multiselectable={multi} className="rx-fade-up absolute left-0 top-[calc(100%+8px)] z-50 min-w-full overflow-hidden rounded-[16px] bg-raised p-1.5 shadow-pop ring-1 ring-line">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onPick(o.value)}
            className={cn("flex w-full items-center justify-between gap-6 whitespace-nowrap rounded-[12px] px-3.5 py-2.5 text-left text-[14px] hover:bg-chip", on && "text-good")}
          >
            {o.label}
            {on && <Check size={15} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dropdown filter pill. Single-select by default; `multi` keeps the menu open and
 * shows "Intern, New grad" style labels.
 */
export function FilterPill({
  label,
  options,
  value,
  onChange,
  multi = false,
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  label: string;
  options: Option[];
  value: string[];
  onChange?: (v: string[]) => void;
  multi?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(value);
  const sel = onChange ? value : local;
  const set = onChange ?? setLocal;
  const ref = useDismiss(open, () => setOpen(false));
  const shown = sel.length ? options.filter((o) => sel.includes(o.value)).map((o) => o.label).join(", ") : label;
  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center justify-between rounded-full border bg-raised transition-colors hover:bg-chip",
          size === "sm" ? "h-8 gap-2 px-3 text-[12px]" : "h-11 min-w-[130px] gap-5 px-5 text-[14px]",
          sel.length ? "border-ink/20 text-ink" : "border-transparent text-ink",
        )}
      >
        <span className="max-w-[180px] truncate">{shown}</span>
        <ChevronDown size={size === "sm" ? 13 : 16} className={cn("text-ink-2 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <Menu
          options={options}
          selected={sel}
          multi={multi}
          onPick={(v) => {
            if (multi) set(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
            else {
              set(sel[0] === v ? [] : [v]);
              setOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Segment({ icon, options, value, onChange }: { icon: ReactNode; options: Option[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className="flex h-full w-full min-w-0 items-center gap-3 px-5 text-[14px]">
        <span className="shrink-0 text-ink">{icon}</span>
        <span className="truncate">{options.find((o) => o.value === value)?.label ?? value}</span>
        <ChevronDown size={16} className="ml-auto shrink-0 text-ink-2" />
      </button>
      {open && (
        <Menu
          options={options}
          selected={[value]}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Hero search: 🔍 role/keyword | 📍 location. Submitting opens the Feed with those filters. */
export function SearchPill({
  roles,
  locations,
  defaultRole,
  defaultLocation,
  onSubmit,
  className,
}: {
  roles: Option[];
  locations: Option[];
  defaultRole: string;
  defaultLocation: string;
  onSubmit?: (role: string, location: string) => void;
  className?: string;
}) {
  const [role, setRole] = useState(defaultRole);
  const [loc, setLoc] = useState(defaultLocation);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(role, loc);
      }}
      className={cn("glass flex h-14 w-full max-w-[540px] items-stretch !rounded-full", className)}
    >
      <Segment icon={<Search size={18} />} options={roles} value={role} onChange={(v) => { setRole(v); onSubmit?.(v, loc); }} />
      <span className="my-4 w-px bg-line" />
      <Segment icon={<MapPin size={18} fill="currentColor" className="text-ink [&>circle]:fill-card" />} options={locations} value={loc} onChange={(v) => { setLoc(v); onSubmit?.(role, v); }} />
    </form>
  );
}
