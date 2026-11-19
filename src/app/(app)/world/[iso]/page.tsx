import { redirect } from "next/navigation";

/** Country briefings open as a slide-over on Home; old /world/xx links land there. */
export default async function CountryPage({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  redirect(`/?country=${encodeURIComponent(iso.toUpperCase().slice(0, 2))}`);
}
