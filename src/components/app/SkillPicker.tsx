"use client";
import { FileUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { extractVisitorResume, extractVisitorSkills } from "@/app/actions";
import { Chip, cn } from "@/components/ui/primitives";
import { navStart } from "./RadarLoader";
import { useToast } from "./Toast";

const LEVELS = [
  { v: "intern", l: "Internship" },
  { v: "newgrad", l: "New grad" },
  { v: "research", l: "Research" },
  { v: "experienced", l: "Experienced" },
];
const REGIONS = [
  { v: "india", l: "India" },
  { v: "remote", l: "Remote" },
  { v: "global", l: "Abroad" },
];
const COOKIE = "rx_profile";

function writeCookie(value: string | null) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = value
    ? `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax${secure}`
    : `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/**
 * A visitor's own skills (no account): paste resume text or type skills → recognised skills → saved as a cookie in
 * THIS browser only, so the server can rank roles for them. Nothing is stored on the server.
 */
export function SkillPicker({ initial }: { initial: { skills: string[]; levels: string[]; regions: string[] } }) {
  const [skills, setSkills] = useState(initial.skills);
  const [levels, setLevels] = useState(initial.levels.length ? initial.levels : ["intern", "research", "newgrad"]);
  const [regions, setRegions] = useState(initial.regions.length ? initial.regions : ["india", "remote"]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (next: string[]) => {
    writeCookie(next.length ? JSON.stringify({ s: next.slice(0, 40), l: levels, r: regions }) : null);
    navStart();
    router.refresh();
  };
  const apply = (r: Awaited<ReturnType<typeof extractVisitorSkills>>) => {
    if (!r.ok) return toast({ text: r.error, tone: "error" }, 4000);
    const merged = [...new Set([...skills, ...(r.skills ?? [])])].slice(0, 40);
    setSkills(merged);
    setText("");
    save(merged);
    toast({ text: `${r.skills!.length} skills recognised · ranking updated`, tone: "ok" }, 3000);
  };
  const extract = () => start(async () => apply(await extractVisitorSkills(text)));
  const upload = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3_000_000) return toast({ text: "That file is over 3 MB — export a smaller PDF or paste the text.", tone: "error" }, 4000);
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      try {
        apply(await extractVisitorResume(fd));
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section id="skills" className="card flex scroll-mt-24 flex-col gap-4 p-5 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[18px]">Your skills</h2>
        <span className="text-[12px] text-ink-3">Saved in this browser only — your resume is read once and discarded, never stored.</span>
      </header>
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <Chip key={s} tone="accent" className="h-8 gap-1 text-[13px]">
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => setSkills(skills.filter((x) => x !== s))} className="-mr-1 rounded-full p-0.5 hover:bg-black/10">
                <X size={12} />
              </button>
            </Chip>
          ))}
        </div>
      )}
      <label className="flex flex-col gap-2 text-[13px] text-ink-2">
        Paste your resume text, or just list skills (“Python, React, SQL, PyTorch”)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 30_000))}
          rows={4}
          maxLength={30_000}
          className="rounded-[14px] bg-raised p-3 text-[14px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
        />
      </label>
      <div className="flex flex-wrap gap-4 text-[13px]">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Levels</legend>
          {LEVELS.map((o) => (
            <button key={o.v} type="button" aria-pressed={levels.includes(o.v)} onClick={() => toggle(levels, setLevels, o.v)} className={cn("h-8 rounded-full px-3", levels.includes(o.v) ? "bg-active text-active-ink" : "bg-raised text-ink-2")}>
              {o.l}
            </button>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Regions</legend>
          {REGIONS.map((o) => (
            <button key={o.v} type="button" aria-pressed={regions.includes(o.v)} onClick={() => toggle(regions, setRegions, o.v)} className={cn("h-8 rounded-full px-3", regions.includes(o.v) ? "bg-active text-active-ink" : "bg-raised text-ink-2")}>
              {o.l}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !text.trim()} onClick={extract} className="h-11 rounded-full bg-inverse px-5 text-[14px] text-inverse-ink disabled:opacity-50">
          {pending ? "Reading…" : "Find my skills"}
        </button>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          name="file"
          accept="application/pdf,.pdf,text/plain,.txt,.md"
          className="peer sr-only"
          disabled={pending}
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <label
          htmlFor={fileId}
          className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-raised px-5 text-[14px] ring-1 ring-line hover:bg-chip peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:cursor-default peer-disabled:opacity-50"
        >
          <FileUp size={16} aria-hidden /> Upload resume (PDF)
        </label>
        <button type="button" disabled={pending} onClick={() => save(skills)} className="h-11 rounded-full bg-raised px-5 text-[14px] ring-1 ring-line hover:bg-chip">
          Save changes
        </button>
        {skills.length > 0 && (
          <button type="button" onClick={() => (setSkills([]), save([]))} className="h-11 rounded-full px-4 text-[14px] text-ink-2 hover:text-ink">
            Clear
          </button>
        )}
      </div>
    </section>
  );
}
