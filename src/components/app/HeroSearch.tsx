"use client";
import { navStart } from "@/components/app/RadarLoader";
import { useRouter } from "next/navigation";
import { SearchPill } from "@/components/ui/FilterPill";
import { LOCATION_OPTIONS, locationFilter, ROLE_FILTERS, ROLE_OPTIONS, toSearch } from "@/lib/filters";

export function HeroSearch() {
  const router = useRouter();
  return (
    <SearchPill
      roles={ROLE_OPTIONS}
      locations={LOCATION_OPTIONS}
      defaultRole="ai-intern"
      defaultLocation="india"
      onSubmit={(role, loc) => (navStart(), router.push(`/feed${toSearch({ ...ROLE_FILTERS[role], ...locationFilter(loc) })}`))}
    />
  );
}
