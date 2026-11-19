import { FilterBar } from "@/components/app/FilterBar";
import { JobsView } from "@/components/app/JobsView";
import { PanelSlot } from "@/components/app/PanelSlot";
import { parseFilters, type RawParams } from "@/lib/filters";
import { getJobsFor } from "@/lib/jobsForViewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feed · RadarX" };

export default async function FeedPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const f = parseFilters(await searchParams, { view: "list", sort: "new" });
  const { jobs, total } = await getJobsFor(f);
  return (
    <>
      <header className="mt-10 flex flex-wrap items-end justify-between gap-4 lg:mt-14">
        <div>
          <h1 className="text-[44px] leading-none md:text-[56px]">
            <span className="font-light text-ink-2">All</span> Feed
          </h1>
          <p className="num mt-2 text-[15px] font-light text-ink-2">
            {total.toLocaleString("en-IN")} postings · newest first<span className="hidden md:inline"> · j/k move · o apply · s star · x dismiss</span>
          </p>
        </div>
      </header>
      <div className="mt-6">
        <FilterBar showSearch showView showTech defaultView="list" />
      </div>
      <div className="mt-5">
        <JobsView key={JSON.stringify({ ...f, job: "" })} initial={jobs} total={total} filters={{ ...f, job: "" }} view={f.view} />
      </div>
      <PanelSlot id={f.job} />
    </>
  );
}
