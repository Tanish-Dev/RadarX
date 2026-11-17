import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Chip, cn, HeroTitle, KeyValueRow } from "@/components/ui/primitives";
import type { RawParams } from "@/lib/filters";
import { getPrograms, type ProgramView } from "@/lib/queries";
import { ago } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research & Programs · RadarX" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open now" },
  { value: "soon", label: "Opening soon" },
  { value: "india", label: "India" },
  { value: "government", label: "Government" },
  { value: "abroad", label: "Abroad" },
  { value: "open-source", label: "Open source" },
];

function matches(v: ProgramView, f: string) {
  switch (f) {
    case "open": return v.status.status === "open" || v.status.status === "closing" || v.status.status === "rolling";
    case "soon": return v.status.status === "soon";
    case "india": return v.p.india;
    case "abroad": return v.p.tags.includes("abroad");
    case "government": return v.p.tags.includes("government");
    case "open-source": return v.p.tags.includes("open-source");
    default: return true;
  }
}

/** Soft generative gradient seeded by the program id (no stock photos). */
function seedGradient(id: string) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const hue = h % 360, hue2 = (hue + 40 + (h >> 8) % 80) % 360, hue3 = (hue + 180 + (h >> 16) % 60) % 360;
  const x = 20 + (h % 60), y = 20 + ((h >> 4) % 60);
  return {
    background: `radial-gradient(circle at ${x}% ${y}%, hsl(${hue} 90% 72%) 0%, transparent 55%),
      radial-gradient(circle at ${100 - x}% ${100 - y}%, hsl(${hue2} 85% 66%) 0%, transparent 60%),
      linear-gradient(135deg, hsl(${hue3} 70% 82%), hsl(${hue} 60% 70%))`,
  };
}

function ProgramCard({ v, flip }: { v: ProgramView; flip: boolean }) {
  const { p } = v;
  return (
    <article className="rx-lift grid overflow-hidden rounded-card bg-card shadow-card ring-1 ring-line md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_56px] dark:ring-line">
      <div className={cn("relative min-h-[140px] md:min-h-full dark:brightness-[.55] dark:saturate-[.75]", flip && "md:order-2")} style={seedGradient(p.id)} aria-hidden>
        <span className="absolute bottom-4 left-5 rounded-full bg-white/80 px-3 py-1 text-[12px] text-[#0B0B0C] backdrop-blur">
          {p.india ? "🇮🇳 " : ""}{p.country}
        </span>
      </div>
      <div className={cn("flex flex-col gap-4 p-6 md:p-8", flip && "md:order-1")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] leading-tight md:text-[26px]">{p.name}</h2>
            <p className="mt-1 text-[15px] font-light text-ink-2">{p.org}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={v.status.tone}>{v.status.label}</Chip>
            {v.recentlyChanged && <Chip tone="new">Page updated</Chip>}
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-ink/80">{p.summary}</p>
        <div>
          <KeyValueRow k="Application window" v={v.windowLabel} />
          {p.runs && <KeyValueRow k="Runs" v={p.runs} />}
          <KeyValueRow k="Eligibility" v={<span className="block max-w-[420px]">{p.eligibility}</span>} />
          {p.stipend && <KeyValueRow k="Stipend" v={p.stipend} />}
          {v.deadline && <KeyValueRow k="Deadline (from page)" v={new Date(v.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />}
          <KeyValueRow
            k="Last page change"
            v={
              p.watch
                ? v.error
                  ? <span className="text-bad">Check failed ({v.error})</span>
                  : v.lastChanged
                    ? ago(v.lastChanged)
                    : v.lastChecked
                      ? `No change since watching began (${ago(v.lastChecked)})`
                      : "Not checked yet"
                : <span className="text-ink-2">Site blocks automated checks — open it manually</span>
            }
          />
        </div>
      </div>
      <a
        href={p.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 border-t border-line py-4 text-[13px] tracking-[0.08em] text-ink transition-colors hover:bg-raised md:order-3 md:border-l md:border-t-0 md:py-0"
      >
        <span className="md:[writing-mode:vertical-rl]">APPLY</span>
        <ChevronRight size={15} className="md:rotate-90" />
      </a>
    </article>
  );
}

export default async function ResearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const f = typeof sp.f === "string" ? sp.f : "";
  const all = await getPrograms();
  const shown = all.filter((v) => matches(v, f));
  const openCount = all.filter((v) => matches(v, "open")).length;
  return (
    <>
      <header className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-[1fr_auto] lg:items-end">
        <HeroTitle light="Research" strong="& Programs" />
        <p className="max-w-md text-[14px] font-light text-ink-2">
          {all.length} programs ({all.filter((v) => v.p.india).length} in India). RadarX watches each official page and alerts you on Telegram when the application text changes.
          <span className="mt-1 block num text-ink">{openCount} open or rolling right now</span>
        </p>
      </header>
      <nav className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Filter programs">
        {FILTERS.map((x) => (
          <Link
            key={x.value}
            href={x.value ? `/research?f=${x.value}` : "/research"}
            aria-current={f === x.value ? "page" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center rounded-full px-6 text-[15px] transition-colors",
              f === x.value ? "bg-active text-active-ink" : "border border-line bg-raised hover:bg-chip",
            )}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 flex flex-col gap-5">
        {shown.map((v, i) => (
          <ProgramCard key={v.p.id} v={v} flip={i % 2 === 1} />
        ))}
        {!shown.length && <div className="card p-10 text-center text-ink-2">Nothing matches this filter right now.</div>}
      </div>
      <p className="mt-8 flex items-center gap-1.5 text-[13px] text-ink-3">
        <ExternalLink size={13} /> Windows are typical months from past cycles — always confirm dates on the official page.
      </p>
    </>
  );
}
