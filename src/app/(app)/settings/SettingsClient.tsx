"use client";
import { FileUp, Plus, Search, Send, X } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { addCompany, saveAlertRules, testAlert, updatePreferences, updateSkills, uploadResume } from "@/app/actions";
import { useResultToast } from "@/components/app/Toast";
import { Chip, cn } from "@/components/ui/primitives";
import type { AlertRules } from "@/lib/settings";

function Card({ id, title, note, children, className }: { id: string; title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("card scroll-mt-24 p-6 md:p-8", className)}>
      <h2 className="text-[26px]">{title}</h2>
      {note && <p className="mt-1 text-[14px] font-light text-ink-2">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full px-4 text-[14px] transition-colors",
        on ? "bg-active text-active-ink" : "border border-line bg-card text-ink hover:bg-raised",
      )}
    >
      {children}
    </button>
  );
}

const LEVELS = [
  ["intern", "Intern"],
  ["newgrad", "New grad"],
  ["research", "Research"],
  ["experienced", "Experienced"],
] as const;
const REGIONS = [
  ["india", "India"],
  ["remote", "Remote"],
  ["global", "Abroad"],
] as const;
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

// ── Resume ──────────────────────────────────────────────────────────────────
export function ResumeCard({ skills: initial, levels: initLevels, regions: initRegions, updatedAt }: { skills: string[]; levels: string[]; regions: string[]; updatedAt: number | null }) {
  const [skills, setSkills] = useState(initial);
  const [levels, setLevels] = useState(initLevels);
  const [regions, setRegions] = useState(initRegions);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [add, setAdd] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const show = useResultToast();

  const upload = (file?: File) =>
    start(async () => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      else fd.set("text", text);
      const r = await uploadResume(fd);
      show(r);
      if (r.ok && r.skills) {
        setSkills(r.skills);
        setPaste(false);
        setText("");
      }
    });
  const saveSkills = (next: string[]) =>
    start(async () => {
      const r = await updateSkills(next);
      if (r.ok && r.skills) setSkills(r.skills);
      if (r.ok && r.unknown?.length) show({ ok: false, error: `Not in the skills list: ${r.unknown.join(", ")}` });
    });

  return (
    <Card id="resume" title="Resume" note="Your resume only ranks postings (match %). It never hides anything.">
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-10 text-center transition-colors",
          drag ? "border-accent bg-accent/5" : "border-line",
        )}
      >
        <FileUp size={28} className="text-ink-2" />
        <p className="text-[15px]">{pending ? "Reading your resume…" : "Drop your resume PDF here"}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className="h-10 rounded-full px-5 text-[14px] bg-inverse text-inverse-ink">
            Choose PDF
          </button>
          <button type="button" onClick={() => setPaste(!paste)} className="h-10 rounded-full border border-line bg-card px-5 text-[14px] hover:bg-raised">
            Paste text
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {updatedAt && <p className="num text-[12px] text-ink-3">Last updated {new Date(updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
      </div>
      {paste && (
        <div className="mt-4 flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste your resume text…"
            className="w-full rounded-[16px] border border-line bg-raised p-4 text-[14px] outline-none focus:border-accent/50"
          />
          <button type="button" disabled={pending || !text.trim()} onClick={() => upload()} className="h-11 self-start rounded-full px-5 text-[14px] bg-inverse text-inverse-ink disabled:opacity-50">
            Extract skills
          </button>
        </div>
      )}

      <h3 className="mt-8 text-[17px]">Skills {skills.length > 0 && <span className="num text-ink-2">({skills.length})</span>}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {skills.map((s) => (
          <Chip key={s} tone="accent" className="pr-1.5">
            {s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => saveSkills(skills.filter((x) => x !== s))} className="flex size-5 items-center justify-center rounded-full hover:bg-accent/15">
              <X size={12} />
            </button>
          </Chip>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (add.trim()) saveSkills([...skills, ...add.split(",").map((s) => s.trim()).filter(Boolean)]);
            setAdd("");
          }}
          className="flex h-8 items-center gap-1 rounded-full border border-line pl-3 pr-1"
        >
          <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add skill" className="w-24 bg-transparent text-[13px] outline-none placeholder:text-ink-3" />
          <button type="submit" aria-label="Add skill" className="flex size-6 items-center justify-center rounded-full hover:bg-raised">
            <Plus size={13} />
          </button>
        </form>
      </div>

      <h3 className="mt-8 text-[17px]">I&apos;m looking for</h3>
      <p className="text-[13px] font-light text-ink-2">Gives a match bonus — doesn&apos;t filter.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {LEVELS.slice(0, 3).map(([v, l]) => (
          <Toggle key={v} on={levels.includes(v)} onClick={() => { const n = toggle(levels, v); setLevels(n); start(() => void updatePreferences(n, regions)); }}>{l}</Toggle>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" />
        {REGIONS.map(([v, l]) => (
          <Toggle key={v} on={regions.includes(v)} onClick={() => { const n = toggle(regions, v); setRegions(n); start(() => void updatePreferences(levels, n)); }}>{l}</Toggle>
        ))}
      </div>
    </Card>
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────
export function AlertsCard({ rules: initial, hasResume }: { rules: AlertRules; hasResume: boolean }) {
  const [r, setR] = useState(initial);
  const [pending, start] = useTransition();
  const show = useResultToast();
  const save = (patch: Partial<AlertRules>) => {
    const next = { ...r, ...patch };
    setR(next);
    start(async () => void (await saveAlertRules(patch)));
  };
  return (
    <Card id="alerts" title="Alerts" note="Which new postings are pushed to Telegram. Everything still appears in the Feed.">
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-[14px] text-ink-2">Levels</p>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map(([v, l]) => (
              <Toggle key={v} on={r.levels.includes(v)} onClick={() => save({ levels: toggle(r.levels, v) })}>{l}</Toggle>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[14px] text-ink-2">Regions</p>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map(([v, l]) => (
              <Toggle key={v} on={r.regions.includes(v)} onClick={() => save({ regions: toggle(r.regions, v) })}>{l}</Toggle>
            ))}
            <span className="mx-1 w-px self-stretch bg-line" />
            <Toggle on={r.techOnly} onClick={() => save({ techOnly: !r.techOnly })}>Tech roles only</Toggle>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="flex justify-between text-[14px] text-ink-2">
              Minimum match <span className="num text-ink">{r.minScore ? `${r.minScore}%` : "off"}</span>
            </span>
            <input type="range" min={0} max={90} step={5} value={r.minScore} disabled={!hasResume} onChange={(e) => setR({ ...r, minScore: Number(e.target.value) })} onPointerUp={() => save({ minScore: r.minScore })} onKeyUp={() => save({ minScore: r.minScore })} className="mt-3 w-full accent-[var(--accent)]" />
            {!hasResume && <span className="text-[12px] text-ink-3">Needs a resume</span>}
          </label>
          <label className="block">
            <span className="flex justify-between text-[14px] text-ink-2">
              Messages per run <span className="num text-ink">{r.maxPerRun}</span>
            </span>
            <input type="range" min={1} max={30} value={r.maxPerRun} onChange={(e) => setR({ ...r, maxPerRun: Number(e.target.value) })} onPointerUp={() => save({ maxPerRun: r.maxPerRun })} onKeyUp={() => save({ maxPerRun: r.maxPerRun })} className="mt-3 w-full accent-[var(--accent)]" />
            <span className="text-[12px] text-ink-3">The rest arrive as one summary</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle on={r.quietHours.enabled} onClick={() => save({ quietHours: { ...r.quietHours, enabled: !r.quietHours.enabled } })}>Quiet hours</Toggle>
          <input type="time" value={r.quietHours.start} disabled={!r.quietHours.enabled} onChange={(e) => save({ quietHours: { ...r.quietHours, start: e.target.value } })} className="num h-10 rounded-full border border-line bg-card px-4 text-[14px] disabled:opacity-40" />
          <span className="text-ink-2">to</span>
          <input type="time" value={r.quietHours.end} disabled={!r.quietHours.enabled} onChange={(e) => save({ quietHours: { ...r.quietHours, end: e.target.value } })} className="num h-10 rounded-full border border-line bg-card px-4 text-[14px] disabled:opacity-40" />
          <span className="text-[13px] text-ink-2">IST · alerts are held and sent afterwards</span>
        </div>
        <div className="flex items-center gap-3 border-t border-line pt-6">
          <button type="button" disabled={pending} onClick={() => start(async () => show(await testAlert()))} className="flex h-11 items-center gap-2 rounded-full px-5 text-[14px] bg-inverse text-inverse-ink">
            <Send size={15} /> Send test alert
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Channels ────────────────────────────────────────────────────────────────
export function ChannelsCard({ telegram, discord }: { telegram: boolean; discord: boolean }) {
  const Row = ({ name, on, how }: { name: string; on: boolean; how: string }) => (
    <div className="flex items-start justify-between gap-4 border-b border-line py-4 last:border-b-0">
      <div>
        <p className="text-[15px]">{name}</p>
        <p className="text-[13px] font-light text-ink-2">{on ? "Connected" : how}</p>
      </div>
      <Chip tone={on ? "new" : "outline"}>{on ? "● Connected" : "Not set up"}</Chip>
    </div>
  );
  return (
    <Card id="channels" title="Channels">
      <Row name="Telegram" on={telegram} how="Add TELEGRAM_BOT_TOKEN to .env.local, message your bot, then run npm run telegram:setup for the chat ID." />
      <Row name="Discord (optional)" on={discord} how="Add DISCORD_WEBHOOK_URL to .env.local." />
    </Card>
  );
}

// ── Add company ─────────────────────────────────────────────────────────────
export function AddCompanyCard() {
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  const show = useResultToast();
  return (
    <Card id="add-company" title="Add company" note="Type a name (we find its Greenhouse / Lever / Ashby / SmartRecruiters board) or paste a careers URL (also Workday, Oracle).">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addCompany(v);
            show(r);
            if (r.ok) setV("");
          });
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="e.g. Sarvam AI  or  https://jobs.lever.co/…"
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-raised px-5 text-[15px] outline-none focus:border-accent/50"
        />
        <button type="submit" disabled={pending || !v.trim()} className="h-12 rounded-full px-6 text-[15px] bg-inverse text-inverse-ink disabled:opacity-50">
          {pending ? "Looking…" : "Add"}
        </button>
      </form>
    </Card>
  );
}

// ── Source health ───────────────────────────────────────────────────────────
export interface HealthRow {
  key: string;
  name: string;
  group: string | null;
  ats: string;
  status: string;
  lastOk: string;
  error: string | null;
  active: number;
}
const STATUS_TONE: Record<string, "new" | "bad" | "warn" | "outline" | "default"> = { ok: "new", error: "bad", unresolved: "warn", pending: "outline", ready: "outline", unsupported: "default" };

export function SourcesCard({ rows }: { rows: HealthRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const counts = useMemo(() => rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {}), [rows]);
  const shown = rows.filter((r) => (!status || r.status === status) && (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.ats.includes(q.toLowerCase())));
  return (
    <Card id="sources" title="Source health" note="Every company and list RadarX polls. Unresolved companies are retried weekly — paste their careers URL above to fix them.">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-raised px-4">
          <Search size={14} className="text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="w-28 bg-transparent text-[14px] outline-none" />
        </div>
        <Toggle on={!status} onClick={() => setStatus("")}>All {rows.length}</Toggle>
        {Object.entries(counts).map(([s, n]) => (
          <Toggle key={s} on={status === s} onClick={() => setStatus(status === s ? "" : s)}>
            {s} {n}
          </Toggle>
        ))}
      </div>
      <div className="mt-5 max-h-[560px] overflow-auto rounded-[16px] border border-line">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="sticky top-0 bg-card text-left text-[12px] text-ink-2">
            <tr>
              <th className="px-4 py-3 font-normal">Source</th>
              <th className="px-4 py-3 font-normal">ATS</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal">Last success</th>
              <th className="px-4 py-3 text-right font-normal">Active</th>
              <th className="px-4 py-3 font-normal">Note</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="px-4 py-2.5">
                  {r.name}
                  {r.group && <span className="block text-[12px] text-ink-3">{r.group}</span>}
                </td>
                <td className="px-4 py-2.5 text-ink-2">{r.ats}</td>
                <td className="px-4 py-2.5">
                  <Chip tone={STATUS_TONE[r.status] ?? "default"} className="h-7 text-[12px]">{r.status}</Chip>
                </td>
                <td className="num px-4 py-2.5 text-ink-2">{r.lastOk}</td>
                <td className="num px-4 py-2.5 text-right">{r.active.toLocaleString("en-IN")}</td>
                <td className="max-w-[260px] truncate px-4 py-2.5 text-[12px] text-ink-2" title={r.error ?? undefined}>{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
