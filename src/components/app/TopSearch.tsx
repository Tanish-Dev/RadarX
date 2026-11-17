"use client";
import { navStart } from "@/components/app/RadarLoader";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui/primitives";

/** Top-bar search (ref-01) → opens the Feed filtered by the query. */
export function TopSearch({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navStart();
        router.push(q.trim() ? `/feed?q=${encodeURIComponent(q.trim())}` : "/feed");
      }}
      className={cn("glass flex h-12 items-center gap-3 !rounded-full pl-5 pr-4 focus-within:ring-1 focus-within:ring-ink/20", className)}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search role, company, city…"
        aria-label="Search postings"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-2"
      />
      <button type="submit" aria-label="Search" className="text-ink">
        <Search size={19} />
      </button>
    </form>
  );
}

/** RadarX mark — a radar sweep (own design, not taken from the references). */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5" aria-label="RadarX">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden className="text-ink">
        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
        <path d="M16 16 L16 2 A14 14 0 0 1 29.3 11.7 Z" fill="currentColor" opacity=".9" />
        <circle cx="22.5" cy="9.5" r="2" fill="var(--green)" />
      </svg>
      <span className="hidden text-[18px] font-medium tracking-[-0.03em] xl:inline">RadarX</span>
    </span>
  );
}
