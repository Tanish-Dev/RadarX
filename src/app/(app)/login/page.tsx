import { redirect } from "next/navigation";
import { HeroTitle } from "@/components/ui/primitives";
import { safeNext } from "@/lib/owner";
import { isOwner } from "@/lib/viewer";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner sign-in · RadarX", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  if (await isOwner()) redirect(next);
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col gap-6">
      <HeroTitle light="Owner" strong="sign-in" />
      <p className="text-[14px] font-light text-ink-2">
        RadarX is free to use without an account — this is only for the person who runs this site (settings, alerts, sources).
      </p>
      <LoginForm next={next} />
    </div>
  );
}
