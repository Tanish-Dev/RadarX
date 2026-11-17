import { discordConfigured, telegramConfigured } from "@/alerts/channels";
import { HeroTitle } from "@/components/ui/primitives";
import { getSourceHealth } from "@/lib/queries";
import { getProfile, getRules } from "@/lib/settings";
import { ago } from "@/lib/time";
import { AddCompanyCard, AlertsCard, ChannelsCard, ResumeCard, SourcesCard } from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · RadarX" };

export default async function SettingsPage() {
  const [profile, rules, sources] = await Promise.all([getProfile(), getRules(), getSourceHealth()]);
  return (
    <>
      <div className="mt-10 lg:mt-14">
        <HeroTitle light="Your" strong="Settings" />
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
