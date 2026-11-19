"use client";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { IconButton } from "@/components/ui/primitives";
import { navStart } from "./RadarLoader";

/** Close = drop `?country=` (map stays as it was — the page scroll and zoom aren't touched). */
export function useCloseCountry() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return useCallback(() => {
    const p = new URLSearchParams(sp.toString());
    p.delete("country");
    const s = p.toString();
    navStart();
    router.push(`${path}${s ? `?${s}` : ""}`, { scroll: false });
  }, [router, path, sp]);
}

/** Slide-over for a country briefing. No backdrop dimming the map — the selected country stays visible beside it. */
export function CountryPanelShell({ label, children }: { label: string; children: React.ReactNode }) {
  const close = useCloseCountry();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <aside
      role="dialog"
      aria-label={label}
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-canvas shadow-pop ring-1 ring-line sm:inset-y-3 sm:right-3 sm:w-[min(600px,calc(100vw-24px))] sm:rounded-[28px] lg:w-[38vw] lg:min-w-[520px]"
      style={{ animation: "rx-panel .22s cubic-bezier(.2,.8,.2,1) both" }}
    >
      <style>{`@keyframes rx-panel{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <span className="text-[13px] text-ink-2">Country briefing</span>
        <IconButton label="Close (Esc)" size={40} onClick={close}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-8 pt-3">{children}</div>
    </aside>
  );
}
