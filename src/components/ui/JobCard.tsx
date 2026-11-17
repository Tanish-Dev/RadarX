"use client";
import { safeHttpUrl } from "@/lib/url";
import { Send, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CompanyLogo } from "./CompanyLogo";
import { Chip, cn, IconButton, MatchRing } from "./primitives";

export interface JobCardData {
  id: string;
  title: string;
  company: string;
  domain?: string | null;
  logo?: string | null;
  url: string;
  /** "6 h ago" */
  ago: string;
  /** "12m" — shown in the ring when there is no score */
  agoShort: string;
  isNew?: boolean;
  score: number | null;
  chips: string[];
  starred?: boolean;
  /** "why it matched" — shared skills (For You) */
  matched?: string[];
}

/**
 * ref-00 job card. `topPick` = green→teal→blue gradient with white text.
 * Actions are callbacks so pages can wire them to server actions.
 */
export function JobCard({
  job,
  topPick = false,
  onStar,
  onDismiss,
  onApply,
  onOpen,
  className,
}: {
  job: JobCardData;
  topPick?: boolean;
  onStar?: (id: string, starred: boolean) => void;
  onDismiss?: (id: string) => void;
  onApply?: (id: string) => void;
  onOpen?: (id: string) => void;
  className?: string;
}) {
  const [starred, setStarred] = useState(!!job.starred);
  useEffect(() => setStarred(!!job.starred), [job.starred]);
  const g = topPick;
  const chips = job.chips;
  return (
    <article
      onClick={() => onOpen?.(job.id)}
      className={cn(
        // compact tile: match ring sits with the actions, Apply rides on the company line — no empty footer
        "card rx-lift group relative flex cursor-pointer flex-col gap-2 overflow-hidden p-3.5",
        g && "!border-good/45 !bg-raised",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <CompanyLogo name={job.company} domain={job.domain} logo={job.logo} size={30} />
        <span className="min-w-0 flex-1">
          {(g || job.isNew) && (
            <span className="flex items-center gap-1.5 text-[11px] text-good">
              <span className="size-1.5 rounded-full bg-good" /> {g ? "Top pick" : "New"}
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <MatchRing value={job.score} label={job.agoShort} size={36} />
          <IconButton
            tone="solid"
            size={28}
            label={starred ? "Unstar" : "Save to Pipeline"}
            aria-pressed={starred}
            onClick={() => {
              setStarred(!starred);
              onStar?.(job.id, !starred);
            }}
          >
            <Star size={13} fill={starred ? "currentColor" : "none"} className={starred ? "text-warn" : undefined} />
          </IconButton>
          <IconButton tone="solid" size={28} label="Dismiss" onClick={() => onDismiss?.(job.id)}>
            <X size={13} />
          </IconButton>
        </div>
      </header>

      <div className="min-w-0">
        <h3 className="line-clamp-2 text-[14px] leading-snug tracking-[-0.02em]">{job.title}</h3>
        <div className="mt-1 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          <p className="min-w-0 truncate text-[12px] text-ink-2">
            {job.company} <span className="mx-0.5">·</span> <span className="num">{job.ago}</span>
          </p>
          <a
            href={safeHttpUrl(job.url) ?? "#"}
            target="_blank"
            rel="noreferrer"
            onClick={() => onApply?.(job.id)}
            aria-label="Apply (opens the posting)"
            title="Apply"
            className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-chip px-2.5 text-[11px] text-ink transition-[transform,background] hover:bg-raised active:scale-95"
          >
            <Send size={11} /> Apply
          </a>
        </div>
      </div>

      <div className="flex max-h-[48px] min-w-0 flex-wrap gap-1 overflow-hidden">
        {job.matched?.slice(0, 3).map((s) => (
          <Chip key={`m-${s}`} tone="accent" className="h-[22px] px-2 text-[11px]">
            {s}
          </Chip>
        ))}
        {chips.map((c) => (
          <Chip key={c} className="h-[22px] px-2 text-[11px]">
            {c}
          </Chip>
        ))}
      </div>
    </article>
  );
}
