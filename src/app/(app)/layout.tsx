import Link from "next/link";
import { Suspense } from "react";
import { Logo, TopSearch } from "@/components/app/TopSearch";
import { Avatar, AlertsBell, RefreshButton } from "@/components/app/TopBarClient";
import { ToastProvider } from "@/components/app/Toast";
import { RouteProgress } from "@/components/app/RadarLoader";
import { BottomNav, PillNav } from "@/components/ui/PillNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getHomeStats, getRecentAlerts } from "@/lib/queries";
import { ago } from "@/lib/time";
import { isOwner } from "@/lib/viewer";
import { ViewerProvider } from "@/components/app/viewer";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

async function TopBar({ owner }: { owner: boolean }) {
  // the alert history is the owner's; "check now" is for everyone (site-wide cooldown in pollNow)
  const [alerts, stats] = await Promise.all([owner ? getRecentAlerts() : Promise.resolve([]), getHomeStats()]);
  return (
    <header className="relative z-30 flex items-center justify-between gap-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <PillNav />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <TopSearch className="hidden w-[260px] xl:flex 2xl:w-[340px]" />
        {stats && <RefreshButton lastSync={stats.lastSync ? ago(stats.lastSync) : "never"} />}
        <span className="hidden sm:block">
          <ThemeToggle size={48} />
        </span>
        {owner ? (
          <>
            <AlertsBell alerts={alerts} />
            <Avatar />
          </>
        ) : (
          <Link href="/for-you#skills" className="flex h-12 items-center gap-2 rounded-full bg-card px-4 text-[14px] ring-1 ring-line hover:bg-raised" title="Add your skills to rank roles by match">
            <Sparkles size={16} className="text-accent" /> <span className="hidden md:inline">Your skills</span>
          </Link>
        )}
      </div>
    </header>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await isOwner();
  return (
    <ViewerProvider owner={owner}>
    <ToastProvider>
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      <div className="relative mx-auto min-h-dvh max-w-[1920px] px-4 pb-10 pt-4 md:px-6 md:pt-5 lg:pb-8">
        <Suspense fallback={<div className="h-12" />}>
          <TopBar owner={owner} />
        </Suspense>
        {children}
      </div>
      <footer className="mx-auto max-w-[1920px] px-4 pb-28 text-[12px] text-ink-3 md:px-6 lg:pb-8">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5" aria-label="Footer">
          <Link href="/about" className="hover:text-ink">About &amp; data sources</Link>
          <Link href="/about#privacy" className="hover:text-ink">Privacy</Link>
          {owner ? <Link href="/settings" className="hover:text-ink">Settings</Link> : <Link href="/login" className="hover:text-ink">Owner sign-in</Link>}
        </nav>
      </footer>
      <BottomNav />
    </ToastProvider>
    </ViewerProvider>
  );
}
