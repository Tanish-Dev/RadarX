"use client";
import { safeHttpUrl } from "@/lib/url";
import { ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { setStage } from "@/app/actions";
import { local, useLocal } from "@/components/app/localStore";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Chip, cn } from "@/components/ui/primitives";
import type { PipelineCard, Stage } from "@/lib/queries";

const STAGES: { id: Stage; label: string; dot: string }[] = [
  { id: "saved", label: "Saved", dot: "bg-ink-3" },
  { id: "applied", label: "Applied", dot: "bg-accent" },
  { id: "interview", label: "Interview", dot: "bg-warn" },
  { id: "offer", label: "Offer", dot: "bg-good" },
  { id: "rejected", label: "Rejected", dot: "bg-bad" },
];

const fmtSpeed = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);
const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Visitor pipeline: built from this browser's own saved roles (src/components/app/localStore.ts). */
export function LocalBoard() {
  const mine = useLocal();
  const cards: PipelineCard[] = Object.values(mine.stages).map((x) => ({
    id: x.snap.id,
    title: x.snap.title,
    company: x.snap.company,
    domain: x.snap.domain,
    logo: x.snap.logo,
    url: x.snap.url,
    stage: x.stage,
    postedTs: x.snap.postedTs ?? x.at,
    statusAt: x.at,
    appliedAt: x.appliedAt,
    speedMin: x.appliedAt && x.snap.postedTs ? Math.max(0, (x.appliedAt - x.snap.postedTs) / 60_000) : null,
    active: true,
    deadline: x.snap.deadline,
  }));
  return (
    <>
      <p className="mb-4 text-[13px] text-ink-3">Your pipeline is saved in this browser only. Star a role or mark it applied anywhere on RadarX to add it here.</p>
      <Board key={cards.map((c) => `${c.id}:${c.stage}`).join(",")} initial={cards} onMove={(id, stage) => local.setStage(id, stage)} />
    </>
  );
}

export function Board({ initial, onMove }: { initial: PipelineCard[]; onMove?: (id: string, stage: Stage | null) => void }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [, start] = useTransition();

  const move = (id: string, stage: Stage | null) => {
    setCards((cs) =>
      stage === null
        ? cs.filter((c) => c.id !== id)
        : cs.map((c) => (c.id === id ? { ...c, stage, statusAt: Date.now(), appliedAt: c.appliedAt ?? (stage !== "saved" ? Date.now() : null) } : c)),
    );
    if (onMove) onMove(id, stage);
    else start(() => void setStage(id, stage));
  };

  return (
    <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
      {STAGES.map((s, si) => {
        const col = cards.filter((c) => c.stage === s.id);
        return (
          <section
            key={s.id}
            onDragOver={(e) => (e.preventDefault(), setOver(s.id))}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) move(dragId, s.id);
              setDragId(null);
              setOver(null);
            }}
            className={cn(
              "flex w-[78vw] shrink-0 flex-col gap-3 rounded-[24px] bg-raised/60 p-3 transition-colors sm:w-[320px] md:w-auto",
              over === s.id && "bg-accent/8 ring-2 ring-accent/40",
            )}
            aria-label={s.label}
          >
            <header className="flex items-center justify-between px-2 pt-1">
              <span className="flex items-center gap-2 text-[15px]">
                <span className={cn("size-2 rounded-full", s.dot)} /> {s.label}
              </span>
              <span className="num text-[13px] text-ink-2">{col.length}</span>
            </header>
            {col.map((c) => (
              <article
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragEnd={() => setDragId(null)}
                className={cn("card cursor-grab !rounded-[20px] p-4 active:cursor-grabbing", dragId === c.id && "opacity-50", !c.active && "opacity-70")}
              >
                <div className="flex items-start gap-3">
                  <CompanyLogo name={c.company} domain={c.domain} logo={c.logo} size={36} />
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] leading-snug">{c.title}</h3>
                    <p className="truncate text-[13px] font-light text-ink-2">{c.company}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
                  {c.appliedAt && <Chip className="h-7 text-[12px]">Applied {fmtDate(c.appliedAt)}</Chip>}
                  {c.speedMin != null && <Chip tone={c.speedMin < 24 * 60 ? "new" : "default"} className="h-7 text-[12px]">{fmtSpeed(c.speedMin)} after posting</Chip>}
                  {!c.appliedAt && c.statusAt && <Chip className="h-7 text-[12px]">Saved {fmtDate(c.statusAt)}</Chip>}
                  {c.deadline && c.deadline > Date.now() && !c.appliedAt && <Chip tone="warn" className="h-7 text-[12px]">Closes {fmtDate(c.deadline)}</Chip>}
                  {!c.active && <Chip tone="outline" className="h-7 text-[12px]">Posting closed</Chip>}
                </div>
                <div className="mt-3 flex items-center gap-1">
                  <button type="button" aria-label="Move left" disabled={si === 0} onClick={() => move(c.id, STAGES[si - 1].id)} className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-raised disabled:opacity-30">
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" aria-label="Move right" disabled={si === STAGES.length - 1} onClick={() => move(c.id, STAGES[si + 1].id)} className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-raised disabled:opacity-30">
                    <ChevronRight size={16} />
                  </button>
                  <a href={safeHttpUrl(c.url) ?? "#"} target="_blank" rel="noreferrer" aria-label="Open posting" className="ml-auto flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-raised">
                    <ExternalLink size={14} />
                  </a>
                  <button type="button" aria-label="Remove from pipeline" onClick={() => move(c.id, null)} className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-bad">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
            {!col.length && <p className="px-2 pb-2 text-[13px] font-light text-ink-3">{s.id === "saved" ? "Star a posting to save it here." : "Drag cards here."}</p>}
          </section>
        );
      })}
    </div>
  );
}
