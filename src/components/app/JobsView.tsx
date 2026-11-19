"use client";
import { safeHttpUrl } from "@/lib/url";
import { navStart } from "@/components/app/RadarLoader";
import { Send, Star, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { dismissJob, loadMoreJobs, markApplied, starJob, undismissJob } from "@/app/actions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { JobCard, type JobCardData } from "@/components/ui/JobCard";
import { Chip, cn, IconButton, MatchRing } from "@/components/ui/primitives";
import type { JobFilters } from "@/lib/filters";
import type { JobRow } from "@/lib/queries";
import { useToast } from "./Toast";
import { local, snapOf, useLocal } from "./localStore";
import { useViewer } from "./viewer";

const LEVEL_LABEL: Record<string, string> = { intern: "Intern", newgrad: "New grad", research: "Research", experienced: "Experienced" };
const TYPE_LABEL: Record<string, string> = { intern: "Internship", research: "Internship", newgrad: "Full-time", experienced: "Full-time" };

function shortLocation(loc: string) {
  const first = loc.split(/\s*[\/;|]\s*/)[0] ?? "";
  const city = first.split(",")[0].trim();
  const more = loc.split(/\s*[\/;|]\s*/).length - 1;
  return city ? (more > 0 ? `${city} +${more}` : city) : "";
}

export function toCard(j: JobRow, withMatched = false): JobCardData {
  const closing = j.deadline && j.deadline > Date.now() && j.deadline - Date.now() < 7 * 86_400_000;
  const chips = [
    j.stipend,
    closing ? `Closes ${new Date(j.deadline!).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : null,
    j.level ? TYPE_LABEL[j.level] : null,
    j.level ? LEVEL_LABEL[j.level] : null,
    shortLocation(j.location) || null,
    j.workplace,
  ].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    domain: j.domain,
    logo: j.logo,
    url: j.url,
    ago: j.ago,
    agoShort: j.agoShort,
    isNew: j.isNew,
    score: j.score,
    chips: withMatched ? chips.slice(0, 2) : chips,
    starred: j.starred,
    matched: withMatched ? j.matched : undefined,
  };
}

/** Shared job actions: optimistic dismiss with undo, star, apply → "Mark as applied?". */
export function useJobActions(onRemove: (id: string) => void, onRestore: () => void, lookup?: (id: string) => JobRow | undefined) {
  const toast = useToast();
  const [, start] = useTransition();
  const { owner } = useViewer();
  if (!owner) {
    // visitors: everything stays in their own browser
    return {
      star: (id: string, starred: boolean) => {
        const j = lookup?.(id);
        if (!j) return;
        local.star(snapOf(j), starred);
        if (starred) toast({ text: "Saved to your Pipeline (this browser)", tone: "ok" }, 2500);
      },
      dismiss: (id: string, company?: string) => {
        onRemove(id);
        local.dismiss(id);
        toast(
          {
            text: "Hidden",
            tone: "ok",
            actions: [
              { label: "Undo", onClick: () => (onRestore(), local.undismiss(id)) },
              ...(company ? [{ label: `Hide all ${company}`, onClick: () => local.hideCompany(company) }] : []),
            ],
          },
          6000,
        );
      },
      applied: (id: string) => {
        const j = lookup?.(id);
        if (!j) return;
        setTimeout(
          () =>
            toast({
              text: "Mark as applied?",
              tone: "ask",
              actions: [
                { label: "Yes", onClick: () => (local.setStage(id, "applied", snapOf(j)), toast({ text: "Moved to your Pipeline · Applied", tone: "ok" })) },
                { label: "Not yet", onClick: () => {} },
              ],
            }),
          400,
        );
      },
    };
  }
  return {
    star: (id: string, starred: boolean) => {
      start(() => void starJob(id, starred));
      if (starred) toast({ text: "Saved to Pipeline", tone: "ok" }, 2500);
    },
    dismiss: (id: string, company?: string) => {
      onRemove(id);
      start(() => void dismissJob(id));
      toast(
        {
          text: "Hidden",
          tone: "ok",
          actions: [
            { label: "Undo", onClick: () => (onRestore(), void undismissJob(id)) },
            ...(company ? [{ label: `Hide all ${company}`, onClick: () => void dismissJob(id, true) }] : []),
          ],
        },
        6000,
      );
    },
    applied: (id: string) => {
      setTimeout(
        () =>
          toast({
            text: "Mark as applied?",
            tone: "ask",
            actions: [
              { label: "Yes", onClick: () => void markApplied(id).then(() => toast({ text: "Moved to Pipeline · Applied", tone: "ok" })) },
              { label: "Not yet", onClick: () => {} },
            ],
          }),
        400,
      );
    },
  };
}

/** Open/close the detail panel via ?job= (shareable; Telegram "Open in RadarX" links use it). */
export function usePanel() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(sp.toString());
      if (id) p.set("job", id);
      else p.delete("job");
      const s = p.toString();
      navStart();
      router.push(`${path}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [router, path, sp],
  );
}

function ListRow({
  j,
  active,
  onOpen,
  onStar,
  onDismiss,
  onApply,
}: {
  j: JobRow;
  active: boolean;
  onOpen: () => void;
  onStar: (v: boolean) => void;
  onDismiss: () => void;
  onApply: () => void;
}) {
  const [starred, setStarred] = useState(j.starred);
  useEffect(() => setStarred(j.starred), [j.starred]); // keyboard "s" updates the row from the list state
  return (
    <li
      data-job={j.id}
      onClick={onOpen}
      className={cn(
        "group flex min-h-14 cursor-pointer items-center gap-3 border-b border-line px-3 py-2 transition-colors last:border-b-0 hover:bg-raised md:gap-4 md:px-4",
        active && "bg-accent/6 ring-1 ring-inset ring-accent/30",
      )}
    >
      <CompanyLogo name={j.company} domain={j.domain} logo={j.logo} size={36} className="max-sm:!size-8" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] leading-snug text-ink sm:truncate">{j.title}</p>
        <p className="truncate text-[13px] font-light text-ink-2">
          {j.company}
          {j.location && <span className="md:hidden"> · {shortLocation(j.location)}</span>}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
        {j.isNew && <Chip tone="new" className="h-7 px-2.5 text-[12px]">NEW</Chip>}
        {j.stipend && <Chip className="h-7 px-2.5 text-[12px]">{j.stipend}</Chip>}
        {j.level && <Chip className="h-7 px-2.5 text-[12px]">{LEVEL_LABEL[j.level]}</Chip>}
        {j.location && <Chip className="h-7 max-w-[180px] truncate px-2.5 text-[12px]">{shortLocation(j.location)}</Chip>}
      </div>
      {j.score != null && <MatchRing value={j.score} size={36} stroke={2} className="hidden sm:block" />}
      <span className={cn("num w-8 shrink-0 text-right text-[13px] sm:w-10", j.isNew ? "text-good" : "text-ink-2")}>{j.agoShort}</span>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" onClick={(e) => e.stopPropagation()}>
        <a
          href={safeHttpUrl(j.url) ?? "#"}
          target="_blank"
          rel="noreferrer"
          onClick={onApply}
          title="Apply"
          aria-label={`Apply to ${j.title}`}
          className="hidden size-9 items-center justify-center rounded-full text-ink-2 hover:bg-card hover:text-ink sm:flex"
        >
          <Send size={15} />
        </a>
        <button
          type="button"
          aria-label={starred ? "Unstar" : "Star"}
          aria-pressed={starred}
          onClick={() => {
            setStarred(!starred);
            onStar(!starred);
          }}
          className={cn("flex size-8 items-center justify-center rounded-full hover:bg-card sm:size-9", starred ? "text-warn" : "text-ink-2 hover:text-ink")}
        >
          <Star size={15} fill={starred ? "currentColor" : "none"} />
        </button>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="flex size-8 items-center sm:size-9 justify-center rounded-full text-ink-2 hover:bg-card hover:text-ink">
          <X size={15} />
        </button>
      </div>
    </li>
  );
}

/**
 * Jobs in cards or list mode, with infinite scroll (100 per page) and keyboard:
 * j/k move · o apply · s star · x dismiss · enter open · / search · esc close.
 */
export function JobsView({
  initial,
  total,
  filters,
  view,
  withMatched = false,
  topPickFirst = false,
  emptyText = "No postings match these filters yet.",
  gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
}: {
  gridClassName?: string;
  initial: JobRow[];
  total: number;
  filters: Partial<JobFilters>;
  view: "list" | "cards";
  withMatched?: boolean;
  topPickFirst?: boolean;
  emptyText?: string;
}) {
  const [jobs, setJobs] = useState(initial);
  const [removed, setRemoved] = useState<JobRow[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const openPanel = usePanel();
  const sp = useSearchParams();
  const activeId = sp.get("job");
  const done = jobs.length >= total - removed.length;

  // Note: no reset when `initial` changes — server actions refresh the page, and that must not
  // drop the keyboard cursor or loaded pages. Parents pass a `key` derived from the filters instead.

  const actions = useJobActions(
    (id) => {
      setJobs((js) => {
        const j = js.find((x) => x.id === id);
        if (j) setRemoved((r) => [...r, j]);
        return js.filter((x) => x.id !== id);
      });
    },
    () => {
      setRemoved((r) => {
        const last = r[r.length - 1];
        if (last) setJobs((js) => [...js, last].sort((a, b) => (b.freshTs ?? 0) - (a.freshTs ?? 0)));
        return r.slice(0, -1);
      });
    },
    (id) => jobs.find((j) => j.id === id) ?? removed.find((j) => j.id === id),
  );
  // visitors: overlay their own stars, drop what they hid (empty on the server render → no hydration mismatch)
  const { owner } = useViewer();
  const mine = useLocal();
  const shown = owner ? jobs : jobs.filter((j) => !mine.dismissed[j.id] && !mine.hiddenCompanies.includes(j.company)).map((j) => (j.starred === !!mine.starred[j.id] ? j : { ...j, starred: !!mine.starred[j.id] }));

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || loading) return;
      setLoading(true);
      const more = await loadMoreJobs(filters, jobs.length + removed.length);
      setJobs((js) => [...js, ...more.filter((m) => !js.some((j) => j.id === m.id))]);
      setLoading(false);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [jobs.length, removed.length, done, loading, filters]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const cur = shown[cursor];
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.max(0, Math.min(shown.length - 1, cursor + (e.key === "j" ? 1 : -1)));
        setCursor(next);
        document.querySelector(`[data-job="${CSS.escape(shown[next]?.id ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "o" && cur) {
        const u = safeHttpUrl(cur.url);
        if (u) window.open(u, "_blank", "noopener");
        actions.applied(cur.id);
      } else if (e.key === "s" && cur) {
        actions.star(cur.id, !cur.starred);
        setJobs((js) => js.map((j) => (j.id === cur.id ? { ...j, starred: !j.starred } : j)));
      } else if (e.key === "x" && cur) {
        actions.dismiss(cur.id);
      } else if (e.key === "Enter" && cur) {
        openPanel(cur.id);
      } else if (e.key === "/") {
        e.preventDefault();
        (document.getElementById("feed-search") as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, cursor, actions, openPanel]);

  if (!shown.length) {
    return <div className="card px-8 py-16 text-center text-[15px] font-light text-ink-2">{emptyText}</div>;
  }

  return (
    <>
      {view === "cards" ? (
        <div className={gridClassName}>
          {shown.map((j, i) => (
            <div key={j.id} data-job={j.id} className={cn("rounded-card", i === cursor && "ring-2 ring-accent ring-offset-2 ring-offset-canvas")}>
              <JobCard
                job={toCard(j, withMatched)}
                topPick={topPickFirst && i === 0}
                onOpen={openPanel}
                onStar={actions.star}
                onDismiss={(id) => actions.dismiss(id, j.company)}
                onApply={actions.applied}
                className="h-full"
              />
            </div>
          ))}
        </div>
      ) : (
        <ul className="card overflow-hidden rounded-3xl! p-1.5">
          {shown.map((j, i) => (
            <ListRow
              key={j.id}
              j={j}
              active={i === cursor || activeId === j.id}
              onOpen={() => {
                setCursor(i);
                openPanel(j.id);
              }}
              onStar={(v) => actions.star(j.id, v)}
              onDismiss={() => actions.dismiss(j.id, j.company)}
              onApply={() => actions.applied(j.id)}
            />
          ))}
        </ul>
      )}
      {/* short, fully-loaded lists (Home sections) don't need a "N postings" footer */}
      <div ref={sentinel} className={cn("text-center text-[13px] text-ink-3", done && jobs.length < 20 ? "h-0" : "py-8")}>
        {done ? (jobs.length < 20 ? "" : `${jobs.length.toLocaleString("en-IN")} postings`) : loading ? "Loading more…" : ""}
      </div>
    </>
  );
}
