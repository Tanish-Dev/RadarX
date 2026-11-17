"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  text: string;
  tone: "ok" | "error" | "ask";
  actions?: ToastAction[];
}

const Ctx = createContext<(t: Omit<ToastItem, "id">, ms?: number) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, "id">, ms = 4000) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.actions ? Math.max(ms, 9000) : ms);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8">
        {items.map((t) => (
          <div key={t.id} className="rx-fade-up pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-inverse py-2.5 pl-4 pr-2.5 text-[14px] text-inverse-ink shadow-pop">
            {t.tone === "ok" && <CheckCircle2 size={16} className="shrink-0 text-good" />}
            {t.tone === "error" && <AlertCircle size={16} className="shrink-0 text-bad" />}
            <span className="min-w-0">{t.text}</span>
            {t.actions?.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-full bg-inverse-ink/15 px-3 py-1 text-[13px] font-medium hover:bg-inverse-ink/25"
              >
                {a.label}
              </button>
            ))}
            {!t.actions && <span className="w-1.5" />}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Show a server action's result as a toast. */
export function useResultToast() {
  const toast = useToast();
  return (r: { ok: boolean; message?: string; error?: string }) => {
    if (r.ok && r.message) toast({ text: r.message, tone: "ok" });
    else if (!r.ok) toast({ text: r.error ?? "Something went wrong", tone: "error" }, 6000);
  };
}
