import { BigNumber, HeroTitle } from "@/components/ui/primitives";
import { getPipeline } from "@/lib/queries";
import { isOwner } from "@/lib/viewer";
import { Board, LocalBoard } from "./Board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline · RadarX" };

const fmtSpeed = (m: number) => (m < 60 ? `${Math.round(m)}m` : m < 48 * 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m / 1440)}d`);

export default async function PipelinePage() {
  // the owner's pipeline is private; visitors get their own, kept in their browser
  if (!(await isOwner())) {
    return (
      <>
        <header className="mt-10 lg:mt-14">
          <HeroTitle light="Your" strong="Pipeline" />
        </header>
        <div className="mt-8">
          <LocalBoard />
        </div>
      </>
    );
  }
  const cards = await getPipeline();
  const speeds = cards.map((c) => c.speedMin).filter((x): x is number => x != null).sort((a, b) => a - b);
  const median = speeds.length ? speeds[Math.floor(speeds.length / 2)] : null;
  const applied = cards.filter((c) => c.stage !== "saved").length;
  const interviews = cards.filter((c) => c.stage === "interview" || c.stage === "offer").length;
  return (
    <>
      <header className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[1fr_auto] lg:items-end">
        <HeroTitle light="Your" strong="Pipeline" />
        <div className="flex flex-wrap gap-10">
          <div>
            <BigNumber value={applied} size="md" />
            <p className="mt-1 text-[13px] text-ink-2">applied</p>
          </div>
          <div>
            <BigNumber value={interviews} size="md" />
            <p className="mt-1 text-[13px] text-ink-2">interviews +</p>
          </div>
          <div>
            <BigNumber value={median == null ? "—" : fmtSpeed(median)} size="md" />
            <p className="mt-1 text-[13px] text-ink-2">median speed to apply</p>
          </div>
        </div>
      </header>
      <div className="mt-8">
        <Board initial={cards} />
      </div>
    </>
  );
}
