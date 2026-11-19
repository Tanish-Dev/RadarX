import { HeroTitle } from "@/components/ui/primitives";
import { FEEDS } from "@/data/news";

export const metadata = { title: "About & data sources · RadarX", description: "What RadarX is, where its data comes from, and what it does (and doesn't) keep about you." };

const SOURCES: { name: string; what: string; href: string; licence: string }[] = [
  { name: "Company career sites", what: "Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Eightfold, Oracle and Amazon job boards — the public job listings companies publish", href: "#", licence: "Public listings; every role links to the employer's own page" },
  { name: "SimplifyJobs on GitHub", what: "Community-maintained internship & new-grad lists", href: "https://github.com/SimplifyJobs", licence: "Public repositories" },
  { name: "Unstop", what: "Indian internships and jobs (public API)", href: "https://unstop.com", licence: "Public API; links back to Unstop" },
  { name: "News feeds", what: `${FEEDS.length} public RSS/Atom feeds (tech + world). Only the headline and a short summary are shown; every story links to the publisher`, href: "#", licence: "Publisher RSS feeds" },
  { name: "USGS", what: "Earthquakes M4.5+", href: "https://earthquake.usgs.gov", licence: "Public domain (US Government)" },
  { name: "NASA EONET", what: "Storms, wildfires, volcanoes, floods", href: "https://eonet.gsfc.nasa.gov", licence: "Public domain (NASA)" },
  { name: "IODA (Georgia Tech)", what: "Country-level internet outages", href: "https://ioda.inetintel.cc.gatech.edu", licence: "Free with attribution" },
  { name: "Official status pages", what: "AWS, Google Cloud, Cloudflare, Vercel, Netlify, Supabase, OpenAI, Claude, GitHub, npm, Atlassian, Discord (their public incident feeds)", href: "#", licence: "Public feeds" },
  { name: "Polymarket", what: "Prediction-market odds (read-only public data; RadarX doesn't offer or promote trading)", href: "https://polymarket.com", licence: "Public API" },
  { name: "Frankfurter / ECB", what: "Daily reference exchange rates", href: "https://frankfurter.dev", licence: "Free; ECB reference rates" },
  { name: "TeleGeography", what: "Submarine cable map layer", href: "https://www.submarinecablemap.com", licence: "CC BY-NC-SA 4.0" },
  { name: "Natural Earth", what: "Country shapes for the map", href: "https://www.naturalearthdata.com", licence: "Public domain" },
  { name: "OpenFreeMap / OpenStreetMap", what: "Map tiles, borders and labels", href: "https://openfreemap.org", licence: "© OpenStreetMap contributors (ODbL)" },
  { name: "EOX Sentinel-2 cloudless", what: "Satellite imagery (dark map)", href: "https://s2maps.eu", licence: "CC BY-NC-SA 4.0 — contains modified Copernicus Sentinel data" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-10 lg:mt-14">
      <header className="flex flex-col gap-4">
        <HeroTitle light="About" strong="RadarX" />
        <p className="text-[16px] font-light leading-relaxed text-ink-2">
          RadarX is a free, non-commercial radar for internships, new-grad and research roles: it checks company career sites every few minutes and shows new roles the moment they appear —
          with tech news, a live world map and job-market signals alongside. No account, no ads, no tracking.
        </p>
      </header>

      <section aria-labelledby="sources" className="flex flex-col gap-4">
        <h2 id="sources" className="text-[22px]">Data sources</h2>
        <p className="text-[14px] text-ink-2">RadarX only uses public APIs and pages that allow automated access, and always links back to the original. It never scrapes sites that forbid it (LinkedIn, Naukri, Internshala and the like are not used).</p>
        <ul className="card divide-y divide-line">
          {SOURCES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-[15px]">{s.href !== "#" ? <a href={s.href} target="_blank" rel="noreferrer noopener" className="hover:underline">{s.name}</a> : s.name}</p>
                <p className="text-[13px] text-ink-2">{s.what}</p>
              </div>
              <p className="shrink-0 text-[12px] text-ink-3 sm:max-w-[220px] sm:text-right">{s.licence}</p>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-3">Job details, news and odds belong to their publishers. Listings can be out of date — always check the employer&apos;s page before applying. Prediction-market odds and the country instability index are informational, not advice.</p>
      </section>

      <section id="privacy" aria-labelledby="privacy-h" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="privacy-h" className="text-[22px]">Privacy</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] leading-relaxed text-ink-2">
          <li><span className="text-ink">No accounts, no analytics, no ads, no third-party trackers.</span></li>
          <li>Roles you star, hide or move through your Pipeline are saved <span className="text-ink">only in your browser</span> (localStorage). Clearing site data removes them.</li>
          <li>Your skills (For You) are kept in a cookie in your browser so the server can rank roles for you. If you paste resume text, it is used once to pick out skills and is <span className="text-ink">not stored</span>.</li>
          <li>The map loads tiles from OpenFreeMap and EOX, and company logos/favicons from their sites or Google&apos;s favicon service — those servers see a normal web request.</li>
          <li>The server keeps standard short-lived request logs at the hosting provider; RadarX itself logs nothing about visitors.</li>
        </ul>
      </section>

      <section aria-labelledby="security-h" className="flex flex-col gap-3">
        <h2 id="security-h" className="text-[22px]">Security</h2>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Visitors can only read. Anything that changes shared data — settings, sources, alerts — requires the site owner&apos;s signed session. Pages are served with a strict Content-Security-Policy and HTTPS-only headers.
          Found a problem? Please report it privately to the site owner rather than publicly.
        </p>
      </section>
    </div>
  );
}
