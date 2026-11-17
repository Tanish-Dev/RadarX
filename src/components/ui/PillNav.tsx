"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, FlaskConical, Home, KanbanSquare, LineChart, Newspaper, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "./primitives";

export const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Live Radar", icon: Home },
  { href: "/feed", label: "Feed", icon: Briefcase },
  { href: "/for-you", label: "For You", icon: Sparkles },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/market", label: "Market", icon: LineChart },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
];

function Pill({ href, label, icon: Icon, active, compact }: { href: string; label: string; icon: LucideIcon; active: boolean; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-center rounded-full transition-colors duration-150",
        compact
          ? cn("h-12 min-w-0 flex-col gap-0.5 whitespace-nowrap text-[11px] tracking-[-0.01em]", active ? "flex-[1.6] bg-active px-2 text-active-ink" : "flex-1 px-0.5 text-ink-2")
          : cn("h-10 shrink-0 px-4 text-[15px]", active ? "bg-active text-active-ink" : "text-ink-2 hover:text-ink"),
      )}
    >
      {compact && <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />}
      {/* seven labels don't fit a phone — the bottom bar labels only the active tab */}
      {(!compact || active) && label}
    </Link>
  );
}

/** Desktop nav: text links with a quiet active pill (ref-01). `activeHref` overrides the route (used by /design). */
export function PillNav({ activeHref, className }: { activeHref?: string; className?: string }) {
  const path = usePathname();
  const active = activeHref ?? path;
  return (
    <nav className={cn("hidden items-center gap-1 lg:flex", className)} aria-label="Main">
      {NAV.map((n) => (
        <Pill key={n.href} {...n} active={n.href === "/" ? active === "/" : active.startsWith(n.href)} />
      ))}
    </nav>
  );
}

/** Mobile: the nav becomes a bottom pill bar. */
export function BottomNav({ activeHref, className, fixed = true }: { activeHref?: string; className?: string; fixed?: boolean }) {
  const path = usePathname();
  const active = activeHref ?? path;
  return (
    <nav
      aria-label="Main"
      className={cn(
        "glass z-40 flex gap-1 !rounded-full p-1.5 shadow-pop lg:hidden",
        fixed && "fixed inset-x-4 bottom-4",
        className,
      )}
    >
      {NAV.map((n) => (
        <Pill key={n.href} {...n} compact active={n.href === "/" ? active === "/" : active.startsWith(n.href)} />
      ))}
    </nav>
  );
}
