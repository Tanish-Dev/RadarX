"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { refreshNews } from "@/app/actions";
import { cn } from "@/components/ui/primitives";

const STALE_MS = 10 * 60_000;

function since(ts: number | null, now: number) {
  if (!ts) return "never";
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/**
 * "Updated 4 min ago · Refresh". Keeps the page live without a worker: if the stories are older than 10 minutes
 * it pulls the feeds itself on load (the server allows one pull per 10 min site-wide) and every 5 minutes while the tab is visible, then re-renders the page.
 */
export function NewsFresh({ checkedAt, className }: { checkedAt: number | null; className?: string }) {
  const router = useRouter();
  const [last, setLast] = useState(checkedAt);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const busy = useRef(false);

  const pull = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        const r = await refreshNews();
        if (r.ok && r.checkedAt) setLast(r.checkedAt);
        if (r.ok && r.fetched) router.refresh();
      } finally {
        busy.current = false;
      }
    });
  }, [router]);

  useEffect(() => {
    setLast(checkedAt);
  }, [checkedAt]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const auto = () => {
      if (document.visibilityState === "visible" && Date.now() - (last ?? 0) > STALE_MS) pull();
    };
    auto();
    const poll = setInterval(auto, 5 * 60_000);
    document.addEventListener("visibilitychange", auto);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", auto);
    };
  }, [last, pull]);

  const stale = !last || now - last > 25 * 60_000;
  return (
    <button
      type="button"
      onClick={pull}
      disabled={pending}
      aria-live="polite"
      className={cn("flex h-8 items-center gap-2 rounded-full border border-line bg-raised px-3 text-[12px] text-ink-2 transition-colors hover:text-ink disabled:opacity-70", className)}
    >
      <span className={cn("size-1.5 rounded-full", stale ? "bg-warn" : "bg-good")} aria-hidden />
      {pending ? "Checking feeds…" : `Updated ${since(last, now)}`}
      <RefreshCw size={12} className={cn(pending && "animate-spin")} aria-hidden />
      <span className="sr-only">Refresh news now</span>
    </button>
  );
}
