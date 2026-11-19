"use client";
import { Bell, RefreshCw, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { markAlertsSeen, pollNow } from "@/app/actions";
import { cn, IconButton } from "@/components/ui/primitives";
import { useResultToast } from "./Toast";

export function RefreshButton({ lastSync }: { lastSync: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const show = useResultToast();
  return (
    <IconButton
      tone="glass"
      size={48}
      label={`Check for new roles now — last check ${lastSync}`}
      onClick={() =>
        start(async () => {
          const r = await pollNow();
          show(r);
          if (r.ok && /now/.test(r.message ?? "")) setTimeout(() => router.refresh(), 90_000);
        })
      }
    >
      <RefreshCw size={18} className={cn(pending && "animate-spin")} />
    </IconButton>
  );
}

export function Avatar() {
  return (
    <Link
      href="/settings"
      title="Profile & resume"
      aria-label="Profile & resume"
      className="glass flex size-12 items-center justify-center !rounded-full text-ink transition-transform hover:bg-raised/60 active:scale-95"
    >
      <User size={20} />
    </Link>
  );
}

export interface BellAlert {
  id: number;
  jobId: string | null;
  kind: string;
  text: string;
  ago: string;
  seen: boolean;
  channel: string;
}

/** Bell with a red dot for unseen alerts; dropdown mirrors what went to Telegram. */
export function AlertsBell({ alerts }: { alerts: BellAlert[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unseen = alerts.some((a) => !a.seen);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton
        tone="glass"
        size={48}
        label="Recent alerts"
        dot={unseen}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open && unseen) void markAlertsSeen();
        }}
      >
        <Bell size={18} />
      </IconButton>
      {open && (
        <div className="rx-fade-up absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,380px)] overflow-hidden glass !rounded-[24px] shadow-pop">
          <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
            <h3 className="text-[17px]">Recent alerts</h3>
            <Link href="/settings#alerts" className="text-[13px] text-accent" onClick={() => setOpen(false)}>
              Rules
            </Link>
          </div>
          {alerts.length === 0 ? (
            <p className="px-5 pb-5 text-[14px] font-light text-ink-2">
              Nothing yet. New postings that match your rules appear here and on Telegram.
            </p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto px-2 pb-2">
              {alerts.map((a) => {
                const body = (
                  <>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.seen ? "bg-ink-3" : a.kind === "test" ? "bg-accent" : "bg-good")} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px]">{a.text}</span>
                      <span className="num text-[12px] text-ink-2">
                        {a.ago} · {a.channel}
                        {a.kind !== "job" ? ` · ${a.kind}` : ""}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={a.id}>
                    {a.jobId ? (
                      <Link href={`/feed?job=${encodeURIComponent(a.jobId)}`} onClick={() => setOpen(false)} className="flex gap-3 rounded-[16px] px-3 py-2.5 hover:bg-raised">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3 rounded-[16px] px-3 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
