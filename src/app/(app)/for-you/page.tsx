import Link from "next/link";
import { FilterBar } from "@/components/app/FilterBar";
import { JobsView } from "@/components/app/JobsView";
import { PanelSlot } from "@/components/app/PanelSlot";
import { GradientCard } from "@/components/ui/cards";
import { Chip, HeroTitle } from "@/components/ui/primitives";
import { parseFilters, type RawParams } from "@/lib/filters";
import { getJobs } from "@/lib/queries";
import { getProfile } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "For You · RadarX" };

export default async function ForYouPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const profile = await getProfile();
  const sp = await searchParams;
  if (!profile.skills.length) {
    return (
      <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <HeroTitle light="For" strong="You" />
        <GradientCard eyebrow="For You" light="Upload your resume" strong="to unlock matches" href="/settings#resume">
          <p className="text-[14px] text-ink-2">RadarX ranks every posting by how well it fits your skills. It never hides anything.</p>
        </GradientCard>
      </div>
    );
  }
  const f = parseFilters(sp, { sort: "match", view: "cards", within: "30d", level: profile.levels });
  const { jobs, total } = await getJobs({ ...f, sort: "match" });
  return (
    <>
      <header className="mt-10 flex flex-col gap-4 lg:mt-14 lg:flex-row lg:items-end lg:justify-between">
        <HeroTitle light="For" strong="You" />
        <div className="max-w-xl">
          <p className="text-[14px] font-light text-ink-2">
            Ranked by match with your {profile.skills.length} skills. <Link href="/settings#resume" className="text-accent">Edit</Link>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.skills.slice(0, 12).map((s) => (
              <Chip key={s} tone="accent" className="h-7 text-[12px]">{s}</Chip>
            ))}
            {profile.skills.length > 12 && <Chip className="h-7 text-[12px]">+{profile.skills.length - 12}</Chip>}
          </div>
        </div>
      </header>
      <div className="mt-8">
        <FilterBar showView defaultView="cards" defaults={{ within: "30d", level: profile.levels }} />
      </div>
      <div className="mt-5">
        <JobsView key={JSON.stringify({ ...f, job: "" })} initial={jobs} total={total} filters={{ ...f, sort: "match", job: "" }} view={f.view} withMatched />
      </div>
      <PanelSlot id={f.job} />
    </>
  );
}
