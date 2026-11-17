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

export const dynamic = "force-dynamic";

async function TopBar() {
  const [alerts, stats] = await Promise.all([getRecentAlerts(), getHomeStats()]);
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
        <RefreshButton lastSync={stats.lastSync ? ago(stats.lastSync) : "never"} />
        <span className="hidden sm:block">
          <ThemeToggle size={48} />
        </span>
        <AlertsBell alerts={alerts} />
        <Avatar />
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      <div className="relative mx-auto min-h-dvh max-w-[1920px] px-4 pb-32 pt-4 md:px-6 md:pt-5 lg:pb-12">
        <Suspense fallback={<div className="h-12" />}>
          <TopBar />
        </Suspense>
        {children}
      </div>
      <BottomNav />
    </ToastProvider>
  );
}
