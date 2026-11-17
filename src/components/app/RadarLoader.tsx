"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS = ["Scanning sources", "Ranking against your resume", "Placing stories on the map", "Checking deadlines", "Almost there"];

/** Radar sweep with blips + rotating status line — the app's loading state. */
export function RadarLoader({ label }: { label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STATUS.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-5" role="status" aria-live="polite">
      <div className="relative size-[148px]">
        {/* rings + crosshair */}
        <svg viewBox="0 0 148 148" className="absolute inset-0 size-full text-ink" aria-hidden>
          {[72, 52, 32, 12].map((r) => (
            <circle key={r} cx="74" cy="74" r={r} fill="none" stroke="currentColor" strokeOpacity={r === 72 ? 0.3 : 0.14} strokeWidth="1" />
          ))}
          <line x1="2" y1="74" x2="146" y2="74" stroke="currentColor" strokeOpacity=".08" />
          <line x1="74" y1="2" x2="74" y2="146" stroke="currentColor" strokeOpacity=".08" />
        </svg>
        {/* sweep */}
        <div
          className="rx-sweep absolute inset-[2px] rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, transparent 280deg, color-mix(in srgb, var(--green) 10%, transparent) 320deg, color-mix(in srgb, var(--green) 55%, transparent) 360deg)",
            animation: "rx-sweep 2.4s linear infinite",
          }}
        />
        {/* blips light up as the beam passes */}
        {[
          [100, 38, 0.55],
          [46, 52, 1.6],
          [108, 96, 0.95],
          [58, 108, 1.95],
          [82, 64, 0.2],
        ].map(([x, y, d], k) => (
          <span
            key={k}
            className="rx-blip absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-good shadow-[0_0_10px_var(--green)]"
            style={{ left: x, top: y, animation: `rx-blip 2.4s ease-out ${d}s infinite both` }}
          />
        ))}
        <span className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[15px] tracking-[-0.02em]">{label ?? "RadarX"}</span>
        <span key={i} className="text-[12px] text-ink-2" style={{ animation: "rx-status 1.4s ease-in-out both" }}>
          {STATUS[i]}…
        </span>
      </div>
    </div>
  );
}

/** Thin top progress bar: starts on internal link clicks / `rx-nav-start`, finishes when the URL changes. */
export function NavProgress({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [grow, setGrow] = useState(false); // mount at 0 width, then animate towards 85%
  useEffect(() => {
    if (state !== "loading") return setGrow(false);
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGrow(true)));
    return () => cancelAnimationFrame(r);
  }, [state]);
  useEffect(() => {
    const start = () => setState("loading");
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
      if (href === window.location.pathname + window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("rx-nav-start", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("rx-nav-start", start);
    };
  }, []);
  // URL changed → navigation committed
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 450);
    return () => clearTimeout(t);
  }, [url]);
  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]">
      <div
        className="h-full bg-[linear-gradient(90deg,transparent,var(--green)_40%,var(--text))] shadow-[0_0_8px_var(--green)]"
        style={
          state === "loading"
            ? { width: grow ? "85%" : "0%", transition: grow ? "width 8s cubic-bezier(.1,.7,.2,1)" : "none" }
            : { width: "100%", opacity: 0, transition: "width .2s ease-out, opacity .35s ease .15s" }
        }
      />
    </div>
  );
}

/** Mount once in the layout (inside <Suspense>): feeds the current URL to NavProgress. */
export function RouteProgress() {
  const path = usePathname();
  const sp = useSearchParams();
  return <NavProgress url={`${path}?${sp.toString()}`} />;
}

/** Call before a programmatic router.push so the top bar shows (link clicks are detected automatically). */
export const navStart = () => window.dispatchEvent(new Event("rx-nav-start"));
