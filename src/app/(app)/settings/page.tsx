import { discordConfigured, telegramConfigured } from "@/alerts/channels";
import { HeroTitle } from "@/components/ui/primitives";
import { getSourceHealth } from "@/lib/queries";
import { getProfile, getRules } from "@/lib/settings";
import { ago } from "@/lib/time";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { isOwner } from "@/lib/viewer";
import { ownerPassword } from "@/lib/owner";
import { AddCompanyCard, AlertsCard, ChannelsCard, ResumeCard, SourcesCard } from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · RadarX" };

export default async function SettingsPage() {
  // middleware already redirects visitors; this is the second lock in case the matcher ever changes
  if (!(await isOwner())) redirect("/login?next=/settings");
  const [profile, rules, sources] = await Promise.all([getProfile(), getRules(), getSourceHealth()]);
  return (
    <>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4 lg:mt-14">
        <HeroTitle light="Your" strong="Settings" />
        {ownerPassword() && (
          <form action={logout}>
            <button type="submit" className="h-10 rounded-full bg-raised px-4 text-[13px] text-ink-2 ring-1 ring-line hover:text-ink">Sign out</button>
          </form>
        )}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ResumeCard skills={profile.skills} levels={profile.levels} regions={profile.regions} updatedAt={profile.updatedAt ?? null} />
        <div className="flex flex-col gap-5">
          <AlertsCard rules={rules} hasResume={profile.skills.length > 0} />
          <ChannelsCard telegram={telegramConfigured()} discord={discordConfigured()} />
        </div>
        <div className="lg:col-span-2">
          <AddCompanyCard />
        </div>
        <div className="lg:col-span-2">
          <SourcesCard rows={sources.map((s) => ({ ...s, lastOk: s.lastOk ? ago(s.lastOk) : "never" }))} />
        </div>
      </div>
    </>
  );
}
