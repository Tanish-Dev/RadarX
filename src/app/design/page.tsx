import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Specimen } from "./Specimen";

export const metadata: Metadata = { title: "Design system · RadarX" };

/** Every component, in both themes, for review against design-refs/ref-00 (light) and ref-01 (dark). */
export default function DesignPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-8 md:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[14px] text-ink-2">RadarX</p>
          <h1 className="text-[34px]">Design system</h1>
        </div>
        <div className="flex items-center gap-3">
          <a href="#dark" className="text-[14px] text-accent hover:underline">
            Jump to dark ↓
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="light rounded-[40px] bg-canvas p-3 text-ink md:p-6">
        <p className="mb-4 px-2 text-[13px] uppercase tracking-[0.02em] text-ink-2">Light theme</p>
        <Specimen />
      </div>

      <div id="dark" className="dark mt-16 rounded-[40px] bg-canvas p-3 text-ink md:p-6">
        <p className="mb-4 px-2 text-[13px] uppercase tracking-[0.02em] text-ink-2">Dark theme · ref-01 (default)</p>
        <Specimen />
      </div>
    </main>
  );
}
