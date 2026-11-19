"use client";
import { safeHttpUrl } from "@/lib/url";
import { ArrowUpRight, Check, Send, Star, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { markApplied, sendJobToTelegram, starJob } from "@/app/actions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Chip, cn, IconButton, KeyValueRow, MatchRing } from "@/components/ui/primitives";
import type { JobDetail } from "@/lib/queries";
import { usePanel, toCard } from "./JobsView";
import { useResultToast } from "./Toast";
import { local, snapOf, useLocal } from "./localStore";
import { useViewer } from "./viewer";

const fmt = (t: number | null) =>
  t == null ? "—" : new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";

const LEVEL: Record<string, string> = { intern: "Internship", newgrad: "New grad", research: "Research", experienced: "Experienced" };
const REGION: Record<string, string> = { india: "India", remote: "Remote", global: "Abroad" };

/** Slide-over detail panel (~42% wide on desktop, full-screen sheet on mobile). ref-02 layout in ref-00 styling. */
export function JobPanel({ job, hasResume }: { job: JobDetail; hasResume: boolean }) {
  const close = usePanel();
  const show = useResultToast();
  const [starred, setStarred] = useState(job.starred);
  const [status, setStatus] = useState(job.status);
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const { owner } = useViewer();
  const mine = useLocal();
  // visitors: Save / Applied come from (and go to) their own browser
  const isStarred = owner ? starred : !!mine.starred[job.id];
  const isApplied = owner ? status === "applied" : mine.stages[job.id]?.stage === "applied";

  useEffect(() => {
    setStarred(job.starred);
    setStatus(job.status);
    setExpanded(false);
  }, [job.id, job.starred, job.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const card = toCard(job);
  const desc = job.description.trim();
  const long = desc.length > 1600;

  return (
    <>
      <div className="rx-fade-up fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] dark:bg-black/50" onClick={() => close(null)} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={job.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-canvas shadow-pop sm:inset-y-3 sm:right-3 sm:w-[min(640px,calc(100vw-24px))] sm:rounded-[32px] lg:w-[42vw] lg:min-w-[560px]"
        style={{ animation: "rx-panel .22s cubic-bezier(.2,.8,.2,1) both" }}
      >
        <style>{`@keyframes rx-panel{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <span className="text-[13px] text-ink-2">{job.sourceName}</span>
          <IconButton label="Close (Esc)" size={40} onClick={() => close(null)}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-8 pt-4">
          <header className="flex items-start gap-4">
            <CompanyLogo name={job.company} domain={job.domain} logo={job.logo} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[26px] leading-tight">{job.title}</h2>
              <p className="mt-1 text-[16px] font-light text-ink-2">
                {job.company} <span className="mx-1">•</span> <span className="num">{job.ago}</span>
              </p>
            </div>
          </header>
          <div className="mt-5 flex flex-wrap gap-2">
            {job.isNew && <Chip tone="new">NEW</Chip>}
            {card.chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
            {job.region && <Chip tone="outline">{REGION[job.region]}</Chip>}
          </div>

          {/* match */}
          <section className="card mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <MatchRing value={job.score} label={job.agoShort} size={112} />
            <div className="min-w-0 flex-1">
              {hasResume ? (
                <>
                  <p className="text-[15px]">
                    {job.matched.length ? `You have ${job.matched.length} of the ${job.skills.length} skills this role mentions` : job.skills.length ? `None of this role's listed skills are on your ${owner ? "resume" : "skill list"} yet` : "This posting lists no recognisable skills — score is based on level and location"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.matched.map((s) => (
                      <Chip key={s} tone="accent" className="h-7 text-[12px]">
                        <Check size={12} /> {s}
                      </Chip>
                    ))}
                    {job.missing.map((s) => (
                      <Chip key={s} className="h-7 text-[12px] text-ink-2">
                        {s}
                      </Chip>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[15px]">{owner ? "Upload your resume in Settings to see your match." : <>Add your skills on <a href="/for-you" className="text-accent underline">For You</a> to see how well you match.</>}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.skills.map((s) => (
                      <Chip key={s} className="h-7 text-[12px]">
                        {s}
                      </Chip>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* key–value rows */}
          <section className="mt-6">
            <KeyValueRow k="Posted" v={job.postedAt ? fmt(job.postedAt) : "not given by source"} />
            <KeyValueRow k="First seen" v={fmt(job.firstSeenAt)} />
            <KeyValueRow k="Location" v={job.location || "—"} />
            {job.stipend && <KeyValueRow k="Stipend / salary" v={job.stipend} />}
            {job.deadline && <KeyValueRow k="Apply by" v={fmt(job.deadline)} />}
            <KeyValueRow k="Level" v={job.level ? LEVEL[job.level] : "—"} />
            <KeyValueRow k="Source" v={job.sourceName} />
            {owner && <KeyValueRow k="Alerted at" v={job.alertedAt ? fmt(job.alertedAt) : job.alertStatus === "seed" ? "initial import (silent)" : job.alertStatus ?? "pending"} />}
            {owner && job.appliedAt && <KeyValueRow k="Applied" v={fmt(job.appliedAt)} />}
          </section>

          <a
            href={safeHttpUrl(job.url) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex h-14 items-center justify-center gap-2 rounded-[16px] bg-inverse text-[16px] font-medium text-inverse-ink transition-opacity hover:opacity-90"
          >
            Apply now <ArrowUpRight size={18} />
          </a>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              aria-pressed={isStarred}
              onClick={() => {
                if (!owner) return local.star(snapOf(job), !isStarred);
                setStarred(!starred);
                start(() => void starJob(job.id, !starred));
              }}
              className={cn("flex h-12 items-center justify-center gap-2 rounded-[14px] border border-line bg-card text-[14px] hover:bg-raised", isStarred && "text-warn")}
            >
              <Star size={15} fill={isStarred ? "currentColor" : "none"} /> {isStarred ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              disabled={isApplied || pending}
              onClick={() =>
                owner
                  ? start(async () => {
                  const r = await markApplied(job.id);
                  show(r);
                  if (r.ok) {
                    setStatus("applied");
                    setStarred(true);
                  }
                })
                  : (local.setStage(job.id, "applied", snapOf(job)), show({ ok: true, message: "Moved to your Pipeline · Applied" }))
              }
              className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-line bg-card text-[14px] hover:bg-raised disabled:text-good"
            >
              <Check size={15} /> {isApplied ? "Applied" : "Mark applied"}
            </button>
            {owner ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => show(await sendJobToTelegram(job.id)))}
                className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-line bg-card text-[14px] hover:bg-raised"
              >
                <Send size={15} /> Telegram
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const u = safeHttpUrl(job.url);
                  if (!u) return;
                  navigator.clipboard?.writeText(u).then(() => show({ ok: true, message: "Apply link copied" }), () => {});
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-line bg-card text-[14px] hover:bg-raised"
              >
                <Send size={15} /> Copy link
              </button>
            )}
          </div>

          <section className="mt-8">
            <h3 className="mb-3 text-[19px]">Description</h3>
            {desc ? (
              <>
                <div className={cn("whitespace-pre-line text-[15px] leading-relaxed text-ink/85", !expanded && long && "max-h-[420px] overflow-hidden [mask-image:linear-gradient(#000_70%,transparent)]")}>
                  {desc}
                </div>
                {long && (
                  <button type="button" onClick={() => setExpanded(!expanded)} className="mt-2 text-[14px] text-accent">
                    {expanded ? "Show less" : "Show full description"}
                  </button>
                )}
              </>
            ) : (
              <p className="text-[15px] font-light text-ink-2">This source doesn&apos;t include a description — open the posting for details.</p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
