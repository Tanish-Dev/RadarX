import { Bell, Compass, LocateFixed, Plus, RefreshCw, User } from "lucide-react";
import { AlertRow, GradientCard, MiniBars, Sparkline, Stat, StatCard } from "@/components/ui/cards";
import { FilterPill, SearchPill } from "@/components/ui/FilterPill";
import { JobCard, type JobCardData } from "@/components/ui/JobCard";
import { ClusterDot, MapBackdrop, MapHoverCard, MapPin } from "@/components/ui/map";
import { BottomNav, PillNav } from "@/components/ui/PillNav";
import { BigNumber, Chip, HeroTitle, IconButton, KeyValueRow, LiveChip, MatchRing } from "@/components/ui/primitives";

// Sample data for the specimen only — invented for RadarX, not taken from the references.
const JOBS: JobCardData[] = [
  { id: "a", title: "Machine Learning Intern", company: "Sarvam AI", domain: "sarvam.ai", url: "#", ago: "8 min ago", agoShort: "8m", isNew: true, score: 92, chips: ["Internship", "Bengaluru", "On-site"] },
  { id: "b", title: "Software Engineer, New Grad", company: "Razorpay", domain: "razorpay.com", url: "#", ago: "3 h ago", agoShort: "3h", score: 84, chips: ["Full-time", "New grad", "Bengaluru", "Hybrid"] },
  { id: "c", title: "Research Intern — LLM Agents", company: "Nvidia", domain: "nvidia.com", url: "#", ago: "6 h ago", agoShort: "6h", score: 77, chips: ["Research", "Remote"], matched: ["PyTorch", "LLMs"] },
];
const UNSCORED: JobCardData = { id: "d", title: "Embedded Firmware Intern", company: "Qualcomm", domain: "qualcomm.com", url: "#", ago: "12 min ago", agoShort: "12m", isNew: true, score: null, chips: ["Internship", "Hyderabad"] };

const ROLES = [
  { value: "ai", label: "AI/ML Intern" },
  { value: "swe", label: "Software Engineer" },
  { value: "data", label: "Data Science" },
  { value: "hw", label: "Hardware / Embedded" },
  { value: "research", label: "Research" },
];
const LOCS = [
  { value: "india", label: "India" },
  { value: "remote", label: "Remote" },
  { value: "world", label: "Worldwide" },
  { value: "pune", label: "Pune" },
  { value: "bengaluru", label: "Bengaluru" },
];

const HOURLY = [3, 5, 2, 8, 6, 9, 4, 12, 7, 10, 14, 9];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[26px]">{title}</h2>
        {note && <p className="text-[14px] font-light text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** The ref-00 home layout, built only from library components. */
function HomeComposition() {
  return (
    <div className="relative overflow-hidden rounded-[36px] bg-canvas ring-1 ring-line">
      <MapBackdrop />
      {/* pins & clusters over the map */}
      <MapPin company="Sarvam AI" domain="sarvam.ai" fresh className="absolute hidden md:inline-flex" style={{ left: "31%", top: "20%" }} />
      <MapPin company="Razorpay" domain="razorpay.com" className="absolute hidden md:inline-flex" style={{ left: "33%", top: "48%" }} />
      <ClusterDot className="absolute hidden md:inline-flex" style={{ left: "21%", top: "8%" }} />
      <ClusterDot count={6} className="absolute hidden md:inline-flex" style={{ left: "27%", top: "33%" }} />
      <ClusterDot className="absolute hidden md:inline-flex" style={{ left: "38%", top: "62%" }} />
      <ClusterDot className="absolute hidden md:inline-flex" style={{ left: "29%", top: "47%" }} />

      <div className="relative p-5 md:p-8">
        {/* top bar */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <IconButton tone="solid" size={48} label="Poll now — last sync 2 min ago">
              <RefreshCw size={18} />
            </IconButton>
            <span className="flex size-12 items-center justify-center rounded-full text-white shadow-card [background:var(--grad-foryou)]" title="Profile & resume">
              <User size={20} />
            </span>
          </div>
          <PillNav activeHref="/" />
          <IconButton tone="solid" size={48} label="Recent alerts" dot>
            <Bell size={18} />
          </IconButton>
        </header>

        {/* hero + bento */}
        <div className="mt-10 grid grid-cols-1 gap-5 lg:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <HeroTitle light="Your" strong="RadarX" chip={<LiveChip label="Live · synced 2m ago" />} />
            <SearchPill roles={ROLES} locations={LOCS} defaultRole="ai" defaultLocation="india" />
            <div className="mt-6 flex gap-3 lg:mt-20">
              <IconButton tone="solid" size={48} label="Recenter">
                <LocateFixed size={18} />
              </IconButton>
              <IconButton tone="solid" size={48} label="Reset north">
                <Compass size={18} />
              </IconButton>
              <IconButton tone="solid" size={48} label="Zoom in">
                <Plus size={18} />
              </IconButton>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:grid-rows-[auto_auto]">
            <StatCard title="New today" href="/feed?within=24h" className="md:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex gap-10">
                  <Stat label="Intern" value="124" delta="+38%" />
                  <Stat label="New grad" value="46" delta="+12%" />
                </div>
                <MiniBars values={HOURLY} />
              </div>
            </StatCard>
            <GradientCard eyebrow="For You" light="View your" strong="top matches" href="#" className="md:row-span-2" />
            <StatCard title={<>Hiring<br />momentum</>} href="/market">
              <Stat value="1.18" delta="+0.06" />
            </StatCard>
            <StatCard title="Open roles tracked" href="/feed">
              <div className="flex items-end justify-between gap-3">
                <Stat value="8,574" delta="+37" />
                <Sparkline values={[4, 6, 5, 9, 7, 6, 11, 8, 12]} />
              </div>
            </StatCard>
          </div>
        </div>

        {/* recommended */}
        <div className="mt-12 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <h2 className="shrink-0 text-[34px]">Recommended</h2>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
            <FilterPill label="Posted" value={["today"]} options={[{ value: "1h", label: "Last hour" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }]} />
            <FilterPill label="Region" value={["india"]} multi options={[{ value: "india", label: "India" }, { value: "remote", label: "Remote" }, { value: "abroad", label: "Abroad" }]} />
            <FilterPill label="Level" value={["intern", "newgrad"]} multi options={[{ value: "intern", label: "Intern" }, { value: "newgrad", label: "New grad" }, { value: "research", label: "Research" }]} />
            <FilterPill label="Domain" value={[]} multi options={[{ value: "ai", label: "AI/ML" }, { value: "software", label: "Software" }, { value: "data", label: "Data" }, { value: "hardware", label: "Hardware" }, { value: "quant", label: "Quant" }]} />
            <FilterPill label="Company group" value={[]} options={[{ value: "ai", label: "AI Labs" }, { value: "big", label: "Big Tech" }, { value: "in", label: "Indian Startups" }]} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {JOBS.map((j, i) => (
            <JobCard key={j.id} job={j} topPick={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Catalog() {
  return (
    <>
      <Section title="Typography" note="Inter 500 / 400 / 300 · headings −0.05em · body −0.04em · tabular numerals">
        <div className="card grid gap-8 p-8 md:grid-cols-2">
          <div className="space-y-3">
            <HeroTitle light="Research" strong="& Programs" />
            <p className="text-[26px] font-medium">Heading 26 / 500</p>
            <p className="text-[19px]">Card title 19 / 400</p>
            <p className="text-[15px]">Body 15 / 400 — rule-based classification keeps alerts fast.</p>
            <p className="text-[15px] font-light text-ink-2">Secondary 15 / 300 — Stripe • 6 h ago</p>
            <p className="text-[12px] text-ink-3">Tertiary label 12 / 400</p>
          </div>
          <div className="flex flex-wrap items-start gap-10">
            <BigNumber value="4,131" delta="54%" />
            <BigNumber value="0.27" delta="+8" />
            <BigNumber value="+18%" size="xl" />
          </div>
        </div>
      </Section>

      <Section title="Colour" note="One blue accent; feature gradients max two per screen; signal colours only carry meaning">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["canvas", "var(--canvas)"],
            ["card", "var(--card)"],
            ["raised", "var(--raised)"],
            ["border", "var(--border)"],
            ["text", "var(--text)"],
            ["text-2", "var(--text-2)"],
            ["text-3", "var(--text-3)"],
            ["accent", "var(--accent)"],
            ["green · fresh", "var(--green)"],
            ["orange · closing", "var(--orange)"],
            ["red · failing", "var(--red)"],
            ["accent gradient", "var(--grad-accent)"],
            ["For You", "var(--grad-foryou)"],
            ["Top pick", "var(--grad-toppick)"],
          ].map(([n, v]) => (
            <div key={n} className="overflow-hidden rounded-tile bg-card ring-1 ring-line">
              <div className="h-16" style={{ background: v }} />
              <p className="px-3 py-2 text-[12px] text-ink-2">{n}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="PillNav · IconButton · Chip">
        <div className="card flex flex-col gap-8 p-8">
          <PillNav activeHref="/feed" className="!flex flex-wrap" />
          <BottomNav activeHref="/for-you" fixed={false} className="!flex max-w-md" />
          <div className="flex flex-wrap items-center gap-3">
            <IconButton label="Default"><RefreshCw size={18} /></IconButton>
            <IconButton tone="solid" label="Solid"><Bell size={18} /></IconButton>
            <IconButton tone="solid" label="With dot" dot><Bell size={18} /></IconButton>
            <IconButton tone="accent" label="Accent"><Plus size={18} /></IconButton>
            <span className="rounded-full p-2 [background:var(--grad-toppick)]">
              <IconButton tone="glass" size={40} label="Glass"><Plus size={16} /></IconButton>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip>Internship</Chip>
            <Chip>Bengaluru</Chip>
            <Chip tone="new">NEW</Chip>
            <Chip tone="accent">PyTorch</Chip>
            <Chip tone="warn">Closes in 3 days</Chip>
            <Chip tone="bad">Failing</Chip>
            <Chip tone="outline">Opens ~Jan</Chip>
            <span className="rounded-full p-1.5 [background:var(--grad-toppick)]">
              <Chip tone="glass">Remote</Chip>
            </span>
          </div>
        </div>
      </Section>

      <Section title="MatchRing" note="Score in the centre, dashed remaining track; freshness when there's no resume">
        <div className="card flex flex-wrap items-center gap-8 p-8">
          <MatchRing value={92} />
          <MatchRing value={64} />
          <MatchRing value={23} />
          <MatchRing value={null} label="12m" />
          <MatchRing value={81} size={64} />
          <MatchRing value={81} size={36} stroke={2} />
          <span className="rounded-full p-3 [background:var(--grad-toppick)]">
            <MatchRing value={88} onGradient />
          </span>
        </div>
      </Section>

      <Section title="JobCard" note="Default, Top pick, unscored (freshness ring), For You (why it matched)">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <JobCard job={UNSCORED} />
          <JobCard job={{ ...JOBS[2] }} />
          <JobCard job={JOBS[0]} topPick />
        </div>
      </Section>

      <Section title="StatCard · GradientCard" note="Big number + superscript delta + mini chart; ↗ deep-links into the filtered Feed">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Hiring momentum" href="/market">
            <Stat value="1.18" delta="+0.06" />
          </StatCard>
          <StatCard title="Open roles tracked" href="/feed">
            <div className="flex items-end justify-between">
              <Stat value="8,574" delta="+37" />
              <Sparkline values={[3, 5, 4, 7, 6, 9, 8, 10]} />
            </div>
          </StatCard>
          <GradientCard eyebrow="For You" light="Upload your resume" strong="to unlock matches" />
        </div>
      </Section>

      <Section title="AlertRow · KeyValueRow · SearchPill · FilterPill">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card flex flex-col gap-2 p-6">
            <h3 className="mb-2 text-[19px]">Attention</h3>
            <AlertRow severity="critical" title="DAAD WISE closes in 2 days" meta="Research · Germany" href="#" />
            <AlertRow severity="warning" title="Mitacs Globalink — application window opened" meta="Program page changed 3 h ago" href="#" />
            <AlertRow severity="good" title="3 unseen matches above 80%" meta="Newest: ML Intern · Sarvam AI" href="#" />
            <AlertRow severity="info" title="Workday · Dell failing" meta="HTTP 422 since yesterday" href="#" />
          </div>
          <div className="card flex flex-col gap-6 p-6">
            <div>
              <KeyValueRow k="Posted" v="8 min ago" />
              <KeyValueRow k="First seen" v="6 min ago" />
              <KeyValueRow k="Location" v="Bengaluru, India" />
              <KeyValueRow k="Source" v="Ashby" />
              <KeyValueRow k="Alerted at" v="11:42 IST" />
            </div>
            <button type="button" className="h-14 rounded-[16px] bg-inverse text-[15px] font-medium text-inverse-ink transition-opacity hover:opacity-90">
              Apply now →
            </button>
            <SearchPill roles={ROLES} locations={LOCS} defaultRole="swe" defaultLocation="remote" />
            <FilterPill label="Level" value={[]} multi options={[{ value: "intern", label: "Intern" }, { value: "newgrad", label: "New grad" }, { value: "research", label: "Research" }]} />
          </div>
        </div>
      </Section>

      <Section title="MapPin · ClusterDot · hover card">
        <div className="card relative flex h-56 items-center justify-center gap-10 overflow-hidden p-8">
          <MapBackdrop />
          <MapPin company="Sarvam AI" domain="sarvam.ai" fresh className="relative" />
          <MapPin company="Unknown Labs" className="relative" />
          <ClusterDot className="relative" />
          <ClusterDot count={12} className="relative" />
          <div className="relative hidden sm:block">
            <MapHoverCard company="Razorpay" count={4} newest="Software Engineer, New Grad" ago="4m ago" />
          </div>
        </div>
      </Section>
    </>
  );
}

export function Specimen() {
  return (
    <>
      <HomeComposition />
      <Catalog />
    </>
  );
}
