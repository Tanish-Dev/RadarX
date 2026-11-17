import { RadarLoader } from "@/components/app/RadarLoader";

/** Shown while a page's server data loads: radar sweep over a faint skeleton of the dashboard. */
export default function Loading() {
  return (
    <div className="relative mt-5 min-h-[78vh]">
      <div aria-hidden className="pointer-events-none grid grid-cols-1 gap-4 opacity-50 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,320px)]">
        <div className="hidden flex-col gap-3 md:flex">
          <div className="rx-skel h-[92px] rounded-card" />
          <div className="rx-skel h-[260px] rounded-card" />
          <div className="rx-skel h-[180px] rounded-card" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="rx-skel h-9 w-2/3 rounded-full" />
          <div className="flex gap-2">
            {[90, 140, 110].map((w) => (
              <div key={w} className="rx-skel h-8 rounded-full" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="rx-skel h-[150px] rounded-card" />
            ))}
          </div>
        </div>
        <div className="hidden flex-col gap-3 md:flex">
          <div className="rx-skel h-[300px] rounded-card" />
          <div className="rx-skel h-[200px] rounded-card" />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass flex items-center justify-center px-12 py-10 shadow-pop">
          <RadarLoader />
        </div>
      </div>
    </div>
  );
}
