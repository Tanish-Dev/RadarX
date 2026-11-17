# RadarX

Personal web app that finds internships, new-grad jobs and research opportunities the moment they're posted, alerts on Telegram, ranks them against the user's resume, and shows tech job-market insights. **Speed from source is the whole point; everything must stay ₹0 / free-tier.** Full spec: `MASTER_PROMPT.md` (it says "Opportunity Radar" — the product name is **RadarX**).

User: 2nd-year B.Tech CSE (AI & DS), MIT-WPU Pune, grad 2029. Interests AI/ML, agentic AI, full-stack, data science, hardware, UI/UX. Wants worldwide roles with India + remote highlighted. Resume is uploaded in-app — never hard-code skills.

## Rules
- Build in phases (below); **stop after each phase** and wait for the go-ahead.
- Never scrape LinkedIn, Naukri, Internshala or any site that forbids it. Public APIs / public pages only.
- Endpoints marked "(verify)" in the spec get a probe first (`npm run probe`); report what doesn't work instead of guessing.
- Every source adapter has a fixture test (`tests/fixtures/*.json` → `tests/adapters.test.ts`). Parsers throw on unexpected shapes.
- No paid APIs or hosting.

## Stack
- Next.js 15 App Router + TypeScript (pinned **TypeScript 5** — TS 7 breaks `next build`), Tailwind v4, Recharts, MapLibre GL (later phases).
- libSQL via `@libsql/client`: `file:data/radar.db` locally, Turso in prod — `DATABASE_URL` (+ `DATABASE_AUTH_TOKEN`). Migrations in `src/lib/db.ts` run on first connection (versioned via `kv.schema_version`).
- Worker: `npm run worker -- --once | --loop | --discover [--all] | --health` (`--only <substr,ats>` to restrict). `tsx`, p-limit 8, 20 s timeout, polite UA, backoff on 429/5xx.
- Tests: vitest (`npm test`). Typecheck: `npm run typecheck`.

## Layout
- `src/lib/http.ts` fetch helper · `db.ts` client + migrations + kv · `text.ts` HTML→text, slugs · `normalize.ts` company key + `dedupe_key`
- `src/sources/types.ts` `RawJob`, `SourceConfig` · `parsers.ts` pure parsers (tested) · `fetchers.ts` network + pagination/queries · `discover.ts` ATS auto-discovery + careers-URL parsing
- `src/data/companies.ts` registry (~275 companies, 8 groups) + `SIMPLIFY_REPOS`
- `src/lib/skills.ts` ~190-skill taxonomy (aliases; `=Word` = case-sensitive) · `classify.ts` is_tech/level/region/domain (bump `CLASSIFIER_VERSION` → full reclassify) · `score.ts` resume match 0–100 · `jobs.ts` classifyPending/rescoreAll · `settings.ts` alert rules + profile in kv, IST quiet hours · `resume.ts` unpdf → skills · `time.ts`
- `src/alerts/format.ts` Telegram HTML / Discord embeds · `channels.ts` senders (1.1 s gap, 429 `retry_after`) · `dispatch.ts` rules → dedupe → quiet hours → top-N + summary; `sendTestAlert()`
- `src/worker/registry.ts` sync registry → `sources`, discovery · `run.ts` per-run pipeline · `index.ts` CLI
- `scripts/probe.ts` hits every ATS type, `--save` refreshes fixtures

## Pipeline (per run)
sync registry → discover pending/unresolved (weekly retry) → fetch all sources concurrently → upsert → enrich new Workday/SmartRecruiters postings via detail API (description + real posted date, ≤25/source/run) → classify new rows → rescore if resume changed → dispatch alerts (`id = {sourceKey}:{externalId}`, `first_seen_at` on insert, `last_seen_at` each run) → strike unseen jobs; 3 strikes = inactive (search-based ATSs also need 3 days unseen) → record `runs` row.
- **Seeding rule:** first successful fetch of a source is stored with `notified=1` (silent).
- **Freshness guard:** an unseen-before posting whose source `posted_at` is older than `FRESH_WINDOW_HOURS` (72) is stored silently — Workday/Eightfold search results are relevance-ordered, so old roles resurface.
- **Alert states** (`jobs.alert_status`): null = pending (`notified=0`) → `sent` | `overflow` (in summary) | `filtered` (rules) | `dup` | `expired` (pending >24 h) | `seed` | `stale`. Pending alerts are held (not dropped) during quiet hours or when no channel is configured.
- **Dedupe:** same `dedupe_key` seen earlier from any source, or already alerted → `dup`; within a batch prefer the direct ATS link over Simplify.
- **Region:** remote locked to another country ("Remote in USA", "US Remote") counts as `global` — not open from India.
- Simplify uses ETag/`If-None-Match`; 304 → all stored jobs count as seen.

## Verified source notes (probed 2026-11-17)
- Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Amazon, Simplify, Oracle (JPMC `CX_1001`, Oracle `eeho.fa.us2` `CX_45001`): work as spec'd.
- SmartRecruiters returns 200 + empty list for unknown slugs and short slugs can be other companies → discovery requires ≥1 posting **and** company-name match.
- Discovery probes all four ATSs and picks the board with the most postings (stale boards are common, e.g. Ramp has 1 job on Greenhouse, 178 on Ashby). Lone first-word slugs only for one-word names.
- Eightfold: Netflix (`explore.jobs.netflix.net`) works on classic `/api/apply/v2/jobs`; Microsoft (`apply.careers.microsoft.com`) and Qualcomm (`careers.qualcomm.com`) only on **`/api/pcsx/search`** (10/page). Eightfold 429s on bursts → requests sequential with 1.2 s gap. American Express: no working Eightfold tenant found (`aexp.eightfold.ai` → "Group ID not found") — left as `auto`/unresolved.
- Workday tenants that failed (422/404) and moved to `auto`: Visa, Walmart, Dell, NXP, Snowflake (→ Ashby), Synopsys, Goldman Sachs, Amex, Palo Alto Networks. ServiceNow is on SmartRecruiters.
- No public API (status `unsupported`, covered by Simplify): Google, Apple, Meta, IBM, SAP, Tesla, Samsung, Goldman Sachs, Jane Street, Citadel, D. E. Shaw, Two Sigma, TCS, Infosys.

## Phase status
1. **Foundation — done.** DB + migrations, adapters (Greenhouse/Lever/Ashby/SmartRecruiters/Workday/Eightfold/Oracle/Amazon/Simplify) with fixture tests, registry + auto-discovery, worker `--once/--loop/--discover/--health`.
2. **Alerts — done.** Classification + skills + scoring, enrichment, dedupe, Telegram/Discord with rules (levels, regions, techOnly, minScore, maxPerRun + summary, IST quiet hours), `npm run telegram:setup`, `alert:test`, `rules`, `resume` (CLI until the Settings page exists). Tests: `tests/classify.test.ts`, `tests/dispatch.test.ts` (temp DB + mocked Telegram).
3. **Dashboard — done.** `/design` (approved), then `(app)` route group: Home (`/`), Feed, For You, job detail slide-over (`?job=<id>`, shareable), Settings (resume upload/skills, preferences, alert rules, channels, add company, source health). (Phase 4 replaced the placeholders.)
4. **Insights, research & India — done.** Research & Programs (`src/data/programs.ts`, 32 programs, 26 India; watcher in `src/worker/programs.ts`, every `PROGRAM_INTERVAL_HOURS`=6, `npm run worker -- --programs`), Market (`getMarket`), live MapLibre map (`LiveMap`/`HomeMap`, OpenFreeMap tiles, `src/data/cities.ts` geocoder), Pipeline board (drag/drop + buttons, `setStage`), first-run card, "Fresh in India" row. India sources: Unstop public API (`unstop-internships`, `unstop-jobs`), India-filtered queries for Workday (per-tenant India facet, cached 7d in kv), Eightfold (`location=India`), Amazon (`country=IND`), +50 Indian companies., Feed, For You, detail panel, Settings.
4. Research & Programs + page watcher, Market, live map, Pipeline, first-run state.
4b. **News — done** (see News section).
5. **Deploy — prepared** (accounts/secrets are the user's step): `.github/workflows/worker.yml` (*/5 cron, no overlap, weekly keepalive), `ci.yml`, `npm run db:push` (local → Turso copy), README with mockups (`docs/`), `.env.example`. "Poll now" on Vercel dispatches the workflow (`GH_DISPATCH_TOKEN` + `GH_REPO`).
   **Hosted-DB cost rules:** `storeJobs` diffs against a per-source seen-state in kv (`seen:<source>` = id → [fingerprint, lastSeenAt, misses, active]) and writes only new/changed rows, a ≤daily last_seen touch, and deactivations; fingerprint excludes postedAt (Workday's relative dates drift). Registry sync skips when `registry_sig` is unchanged; sources row written only on change or every 30 min; aggregate linking incremental since `link_at` (full pass daily); description backlog every 3 h; news writes only new/changed items and changed clusters. Measure with `RADAR_DB_STATS=1` (steady state ≈ 150 rows written/run).
6. Later (don't build): Gemini summaries, cold emails, digest, HN Who's Hiring, funding news.

## Phase 4 notes
- **Unstop:** robots.txt allows `/api/public/*`. Gives stipend (`jobs.stipend`), deadline (`jobs.deadline`), logo (`jobs.logo`). Aggregate like Simplify — use `AGGREGATE_SQL()` / `isAggregateSource()` from `src/data/companies.ts`, never hard-code `simplify-%`.
- **Program watcher:** only keyword lines are hashed; first fetch silent; changes set `programs.pending_alert` and `sendProgramAlerts()` posts to Telegram. Pages that 403 bots (NITI, MeitY, NIC, IAS, IITGN SRIP, IITM SFP) or render client-side (Google STEP, RBI) are `watch: false` link-only entries. Status = page deadline (`extractDeadline`) else typical window.
- **SQLite:** WAL + `busy_timeout` are set on connect — the dashboard and worker share the file.
- **MapLibre 6:** worker served from `public/maplibre-gl-worker.mjs` (copied by `scripts/copy-maplibre-worker.mjs` on postinstall/predev/prebuild) + `setWorkerUrl`. `maplibre-gl.css` forces `.maplibregl-map{position:relative}` → position a wrapper, not the map div. Never animate `transform` on a Marker's own element (MapLibre positions it with transform) — animate an inner element.
- **Market honesty:** boards only list open roles, so month-over-month deltas/rising skills are hidden until 60 days of RadarX runs (week-over-week after 14).

## News (added 2026-11-17, user request)
- 22 public RSS/Atom feeds in `src/data/news.ts` (`FEEDS`: 13 tech incl. HN/ET Tech/Inc42/YourStory/MediaNama, 9 world incl. BBC/Al Jazeera/Guardian/DW/UN/The Hindu). `src/worker/news.ts` `checkNews()` every `NEWS_INTERVAL_MIN` (20) inside each run, conditional GET (ETag/Last-Modified in kv `news_http:<id>`), ≤60 items/feed, ≤7 days old, kept 14 days. `npm run worker -- --news` forces it.
- `src/lib/news.ts` (pure, `tests/news.test.ts` + `tests/fixtures/news-*.xml`): `parseFeed` (RSS 2.0/RDF/Atom, throws on non-feeds), `locate` (title then summary: `PLACES` gazetteer → job-geocoder cities → tech-company HQ (`COMPANY_HQ`, tech only); `~term` = weak (leaders/groups/CEOs), used only if no place is named), `topicsFor`, `clusterNews` (same story across outlets within 36 h → `cluster`, `coverage` = distinct outlets), `storyScore`.
- India news = place in India **by name** (`isIndiaPlace`) — Pakistan/Nepal share India's bounding box. Bump `NEWS_GEO_VERSION` after gazetteer/topic changes → every stored story is re-placed.
- `src/lib/newsQueries.ts`: `getNews` (one card per cluster), `getNewsPoints` (map layer), `getBriefing` (Home). UI: `/news` page, Home "Today's briefing" (Tech / World affairs / Job-market signals / India), map news layer (diamond pills: blue = tech, violet `#b18cff` = world; `mapStore.layers` toggled by the Layers pill), `NewsTicker` on the Home map. Cards link out to the publisher; only title/summary/image are shown.

## Stocks (2026-11-17)
- Twelve Data official API (`TWELVEDATA_API_KEY`, free Basic plan 800 credits/day, 8/min; 1 credit/symbol). Stooq disallows bots (robots + JS challenge) and Yahoo's terms forbid automated use — don't switch to them. `src/data/stocks.ts` WATCHLIST (14: chips, Big Tech, India ADRs + NSE which may need a paid plan), `src/lib/stocks.ts` parsers (`tests/stocks.test.ts`), `src/worker/stocks.ts` every `STOCK_INTERVAL_MIN` (30): 7 quotes in rotation + one 30-day series per run; plan errors retried daily. `--stocks [--demo]` (demo key = AAPL only). Tables `stocks`, `stock_history` (v7). UI: Home `StockStrip`, Market `#stocks` cards.

## Home layout (2026-11-17, user request)
- Hero: on xl the live map is a full-bleed background (`w-screen`, `-top-[84px]` behind the top bar, fades top/bottom); widgets float as `glass` columns (left 352px: stats grid, Job-market signals, 2 top matches; right 336px: Attention, Detection lag, Posting volume). `MapCanvas hero` frames India between them via `pad` (+ gutter when the viewport exceeds the 1920px content column). Page container is `max-w-[1920px]`; horizontal clipping lives on `html, body` (never on the container, or the map shows side bars).
- Below: `BriefingCarousel` (380–420px column; one tall rotating story, lanes Top/Tech/World/India, 9 s, pauses on hover) beside a right column split in two: Recommended (8 cards, `FilterBar small`) over Fresh in India (8 cards), both `CARD_GRID` (4 cols on xl). Hero left column also has `StockMini` (biggest movers).
- Loading: `(app)/loading.tsx` (radar sweep `RadarLoader` over shimmer skeletons), `(app)/template.tsx` fade-in (opacity + backwards-filled nudge — never leave a transform on the wrapper or `position:fixed` panels break), top `RouteProgress` bar; call `navStart()` before any programmatic `router.push/replace`.
- Map-area widgets (ref-01): `Spotlight` marker = dashed ring + glass "Hotspot · 24h" card on the busiest Indian city (vs previous 24 h via `getMapPoints(48)`; card hidden below md); bottom row over the map (xl: `left-[364px] right-0 h-[234px]`): "Arriving now" table (newest early-career roles, last-6h count) + Posting volume histogram; zoom + ticker sit above it, right column stops at `bottom-[262px]`. Map `pad.bottom` 330 keeps India above the bottom row.
- Home hero KPIs (`getHomeKpis`): new early-career roles 24h (+India), strong matches ≥80% 7d, closing ≤7d. Right column: `getSkillDemand` (top skills in open early-career roles vs resume + "learn next").
- Map popups are glass. `JobCard` is the compact tile: match ring beside ★/✕ in the header, Apply on the company line, chips last (no footer). `FilterPill size="sm"` for dense bars.

## Dashboard architecture
- `src/lib/filters.ts` URL params ⇄ `JobFilters` (pure; client-safe). `src/lib/queries.ts` server reads (`server-only`). `src/app/actions.ts` server actions (star/dismiss/applied/telegram/poll/resume/skills/rules/test/addCompany).
- `FRESH_TS` = posted_at, else first_seen_at unless the row came from a silent first import (`alert_status='seed'`) — used for every "new"/"posted within" metric.
- Lists show **one row per role** (`ONE_PER_ROLE` NOT EXISTS on `dedupe_key`, direct ATS preferred over Simplify). Simplify rows are linked to the direct posting via `url_id` (ATS id parsed from the apply URL, `atsIdFromUrl`) ↔ `ext_id`, in `linkAggregateDuplicates()` each run.
- Each run also backfills up to `ENRICH_PER_RUN` (60) missing descriptions for early-career Workday/SmartRecruiters postings; `npm run worker -- --enrich [N]` does it in bulk.
- `JobsView` never resets on server refreshes (actions call `revalidatePath`) — parents pass `key={JSON.stringify(filters)}`.
- Pages: `(app)/layout.tsx` (TopBar + BottomNav + ToastProvider). Home's map is a positioned `MapBackdrop` placeholder with decorative pins until Phase 4's MapLibre map.
- E2E: build to a separate dir so `next dev` survives: `NEXT_DIST_DIR=.next-e2e next build` + `DATABASE_URL=file:<copy> NEXT_DIST_DIR=.next-e2e next start -p 3300`, then drive it with puppeteer-core + system Chrome.

## UI direction (changed 2026-11-17, user request)
**ref-01 (dark dashboard) is now the primary reference**, replacing ref-00's light/gradient look. Dark is the default theme (light stays available via the toggle).
- Near-black canvas, `.card` = dark panel + hairline border (18px radius), `.glass` = blurred translucent panel for overlays on the map. No feature gradients: `--grad-*` vars now resolve to flat colours; active states use `bg-active text-active-ink` (grey pill in dark, black in light); primary buttons `bg-inverse text-inverse-ink`.
- Type: Inter, regular headings, light (300) big numbers via `BigNumber` — a signed delta ("+2.4%") renders as a green/red `Trend` line underneath, any other delta as a grey unit suffix ("/ day"). Page titles are one line (`HeroTitle`: muted first word).
- Top bar: logo + text nav (`PillNav`) + `TopSearch` + poll/theme/bell/profile. Home = ref-01 layout: left widget column (count pills, source tiles, **Closing soon** (`getClosingSoon`: programs with a page deadline first, then best-matching early-career roles with a deadline ≤7 days; replaced the Hiring pulse chart), mini match cards with location mini-map) + satellite map panel (`MapCanvas`, title, `MapViewPills`, floating Attention + "New in India" glass panels, `MapZoomControls`) + Detection lag table + stepped volume histogram; then Recommended and Fresh in India.
- Dark map = **grayscale** (`raster-saturation: -1`) EOX Sentinel-2 cloudless raster (free, keyless, CC BY-NC-SA — personal non-commercial use, attribution shown) + OpenFreeMap borders/city labels; light map = OpenFreeMap positron.
- Charts render client-only (`useMounted`) — Recharts' random ids otherwise cause hydration mismatches. Round any trig-derived SVG coordinates for the same reason.

## UI conventions (Phase 3+, partly superseded above)
- Tokens: CSS vars in `src/app/globals.css` (`:root`/`.light` = ref-00, `.dark` = ref-01), exposed to Tailwind v4 via `@theme inline` → `bg-canvas bg-card bg-raised bg-chip border-line text-ink text-ink-2 text-ink-3 text-accent text-good/warn/bad rounded-card rounded-tile shadow-card shadow-pop`, gradients `[background:var(--grad-accent|--grad-foryou|--grad-toppick)]`. Dark = `.dark` class on <html> (no-flash script in layout, `rx-theme` in localStorage). `.num` = tabular numerals.
- Components in `src/components/ui/`: `primitives.tsx` (cn, Chip, IconButton, MatchRing, KeyValueRow, BigNumber, HeroTitle, LiveChip), `CompanyLogo`, `PillNav`/`BottomNav`, `FilterPill`/`SearchPill`, `cards.tsx` (StatCard, Stat, MiniBars, Sparkline, GradientCard, Waves, AlertRow), `JobCard` (+`topPick`, container-query responsive), `map.tsx` (MapPin, ClusterDot, MapHoverCard, MapBackdrop placeholder until MapLibre), `ThemeToggle`. Icons: lucide-react.
- Grids: always `grid-cols-1`/`minmax(0,…)` so cards can't overflow on mobile.
- Don't run `next build` while `next dev` is running — they share `.next` and the dev server breaks (`__webpack_require__.n is not a function`); fix = stop dev, `rm -rf .next`.
See MASTER_PROMPT §8. ref-00 is primary (light, airy, 28px cards, pill nav, blue gradient accent, match rings); ref-01 drives dark mode + dense widgets; ref-02..04 layout ideas only. Inter only (500/400/300), tabular numerals. Copy layout/visual language, never content/logos/numbers. Hero title: "Your" + "RadarX".
