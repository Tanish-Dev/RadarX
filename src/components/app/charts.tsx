"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useMounted } from "./widgets";

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[12px] bg-card px-3 py-2 text-[12px] shadow-pop ring-1 ring-line">
      <p className="text-ink-2">{label}</p>
      <p className="num text-ink">{payload[0].value.toLocaleString("en-IN")} tech postings</p>
    </div>
  );
}

/** 30-day posting volume — thin rounded bars, no gridlines, no legend (single series). */
export function VolumeChart({ data }: { data: { label: string; n: number }[] }) {
  const mounted = useMounted(); // Recharts' random ids would mismatch on hydration
  if (!mounted) return <div className="h-40 w-full" />;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={6} tick={{ fontSize: 11, fill: "var(--text-2)" }} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "var(--raised)" }} />
          <Bar dataKey="n" fill="var(--text)" radius={[3, 3, 3, 3]} activeBar={{ fill: "var(--accent)" }} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
