# Master Prompt — Opportunity Radar

> Unzip into an empty project folder (it includes `design-refs/` with the 5 reference screenshots), open Claude Code there, and paste everything below.

---

You are building **Opportunity Radar**, a personal web app that finds internships, new-grad jobs and research opportunities the moment they are posted, alerts me instantly on Telegram, ranks them against my resume, and shows me what the tech job market is doing.

Speed is the whole point: the earlier I see a posting, the earlier I apply. Every design decision should favour **getting postings directly from the source, as fast as possible, for ₹0**.

## 0. How to work

1. First, write a `CLAUDE.md` for this project that summarises this prompt (goal, stack, architecture, conventions, phase status). Keep it updated as we go.
2. Build in the phases in §9. **Stop at the end of each phase**, show me what works, and wait for my go-ahead.
3. Never scrape LinkedIn, Naukri, Internshala or any site that forbids it. Only use public APIs and public pages.
4. Some endpoints below are marked **(verify)**. Before relying on them, write a quick probe script, hit them, and adapt the parser to the real response shape. Report anything that doesn't work instead of guessing.
5. Every source adapter needs a fixture-based test (saved sample JSON → parsed jobs) so parsing breaks loudly, not silently.
6. Keep everything free-tier. No paid APIs, no paid hosting.

## 1. Who I am (for matching and filtering)

- 2nd-year B.Tech CSE (AI & Data Science) student at MIT-WPU, Pune, India, graduating 2029.
- Interests: AI/ML, agentic AI, full-stack, data science, hardware (Arduino/Raspberry Pi), UI/UX.
- I want opportunities **worldwide**, with India and remote highlighted.
- My resume will be uploaded inside the app; don't hard-code skills.

## 2. Stack

- **Next.js 15 (App Router) + TypeScript**: dashboard and API routes. Server components that query the DB directly.
- **Database:** libSQL / SQLite via `@libsql/client`. Local file `data/radar.db` in dev, **Turso** (free) in production. Same code path, switched by `DATABASE_URL`.
- **Worker:** a standalone Node/TypeScript script (`npm run worker`, run with `tsx`) that polls all sources, stores new postings and sends alerts. Modes: `--once`, `--loop` (interval from `POLL_INTERVAL_MIN`, default 5), `--discover`, `--health`.
- **Alerts:** Telegram Bot API (primary). Optional Discord webhook (secondary).
- **UI:** Tailwind CSS, Recharts, MapLibre GL JS (free keyless map tiles).
- **Resume parsing:** `unpdf` for PDF text extraction. No paid LLM for v1.
- **Hosting:** Vercel (dashboard), Turso (DB), and the worker on GitHub Actions cron every 5–10 min (public repo = free minutes). Also document running the worker in `--loop` on a Raspberry Pi / old laptop / Oracle Cloud Always-Free VM for tighter timing.
- Concurrency limit for polling (`p-limit`, ~8), 20 s timeout per request, polite User-Agent, retries with backoff.

## 3. Data sources

### 3a. Company hiring systems (fastest; poll every run)

| ATS | Endpoint | Notes |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | `jobs[]`: id, title, absolute_url, location.name, first_published/updated_at, content (HTML-escaped) |
| Lever | `GET https://api.lever.co/v0/postings/{slug}?mode=json` | array: id, text, hostedUrl, createdAt (ms), categories.location/commitment, descriptionPlain |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}` | `jobs[]`: id, title, jobUrl, location, isRemote, publishedAt, descriptionPlain |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100&offset=N` | `content[]`: id, name, releasedDate, location; URL `https://jobs.smartrecruiters.com/{slug}/{id}` |
| Workday | `POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":"intern"}` | `jobPostings[]`: title, externalPath, locationsText, postedOn ("Posted Today"/"Posted 3 Days Ago"). Run several searchText queries (intern, graduate, software engineer, machine learning, data scientist, research). |
| Eightfold **(verify)** | `GET https://{host}/api/apply/v2/jobs?domain={domain}&start=0&num=50&query=intern&sort_by=timestamp` | Microsoft, American Express, Netflix, Qualcomm |
| Oracle Recruiting **(verify)** | `GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={site},limit=50,sortBy=POSTING_DATES_DESC,keyword=intern` | JPMorgan Chase (`jpmc.fa.oraclecloud.com`, site `CX_1001`) |
| Amazon | `GET https://www.amazon.jobs/en/search.json?base_query=intern&offset=0&result_limit=100&sort=recent` | `jobs[]`: id_icims, title, normalized_location, posted_date, job_path |

### 3b. Big-tech portals with no public API (Google, Meta, Apple …)

Use the SimplifyJobs community lists on GitHub (updated within hours; confirmed reachable):

- Internships: `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`
- New grad: `https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json`

Each item: `id, company_name, title, url, locations[], date_posted (unix s), active, is_visible, category, terms[]`. Keep only `active && is_visible` and posted in the last 60 days. Use `If-None-Match`/ETag so unchanged files are skipped. Make the repo names configurable (the season rolls over every year).

### 3c. Company registry (`src/data/companies.ts`)

Seed **200+ companies**, grouped: Big Tech, AI labs, Fintech & banks, Quant/HFT, Indian unicorns & startups, SaaS/enterprise, Semiconductors/hardware, Consulting/IT services. Include at least: Google, Microsoft, Amazon, Apple, Meta, Netflix, Nvidia, Adobe, Salesforce, Intel, AMD, Qualcomm, Cisco, Oracle, IBM, SAP, Uber, Airbnb, Stripe, Databricks, Snowflake, Atlassian, Figma, Notion, OpenAI, Anthropic, Google DeepMind, Cohere, Mistral, Perplexity, Scale AI, Hugging Face, American Express, Visa, Mastercard, PayPal, Goldman Sachs, JPMorgan, Morgan Stanley, Citi, Barclays, Deutsche Bank, BlackRock, Jane Street, Citadel, Tower Research, Optiver, DE Shaw, Flipkart, PhonePe, Razorpay, CRED, Zomato, Swiggy, Zepto, Meesho, Groww, Zerodha, Postman, BrowserStack, Freshworks, Sarvam AI, Ola Krutrim, plus more.

Each entry is either:
- an explicit config (`{ ats: "workday", host, tenant, site }`, `{ ats: "eightfold", host, domain }`, `{ ats: "oracle", host, site }`, `{ ats: "amazon" }`), or
- `{ ats: "auto", slugs: [...] }`. The worker **auto-discovers** the ATS by probing Greenhouse → Lever → Ashby → SmartRecruiters with each candidate slug (plus slugs derived from the name), then caches the result in the `sources` table. Unresolved companies are retried weekly and listed on the Source Health page.

I must be able to **add a company from the UI** by typing its name (discovery runs automatically) or pasting a careers URL.

### 3d. Research programs & fellowships (`src/data/programs.ts`)

A curated list with: name, org, country, official URL, typical application window, eligibility note, and "watch keywords". The worker fetches each page, extracts only the lines containing watch keywords (e.g. "apply", "application", "deadline", next year's number), hashes them, and alerts me when that hash changes. Start with: Summer@EPFL (summer.epfl.ch), ETH Student Summer Research Fellowship, Mitacs Globalink Research Internship, DAAD WISE, Charpak Lab Scholarship, IAS-INSA-NASI Summer Research Fellowship, SURGE (IIT Kanpur), SRIP (IIT Gandhinagar), KAUST VSRP, Google STEP, Google Summer of Code, LFX Mentorship, MLH Fellowship, Outreachy, Amazon ML Summer School. **(verify every URL)**

## 4. Processing pipeline (per run)

1. Fetch every source concurrently; record status, job count and error per source.
2. Normalise to `{ externalId, title, company, location, url, description, postedAt, category }`.
3. ID = `{sourceKey}:{externalId}`. Also a `dedupe_key` = normalised company + title + location, so the same role from Simplify and the company ATS isn't alerted twice (prefer the direct ATS link).
4. Upsert; set `first_seen_at` on insert, `last_seen_at` every run; mark jobs not seen for 3 runs as inactive.
5. **Classify** (rule-based, fast, testable):
   - `is_tech`: broad on purpose. Software, SDE/SWE, AI/ML, data (science/engineering/analytics), research, backend/frontend/full-stack, mobile, cloud, DevOps/SRE, security, embedded/firmware/hardware, robotics, computer vision, NLP/LLM, quant. Exclude sales, marketing, HR/recruiting, legal, customer support, account management, etc.
   - `level`: intern (intern, internship, co-op, trainee, summer, apprentice) / newgrad (new grad, graduate, university, campus, early career, entry level, fresher, junior, 0–2 years) / research (research intern, research fellow, RA) / experienced.
   - `region`: india (India + major Indian cities) / remote / global.
   - `skills`: extracted from title + description using a skills taxonomy (~200 skills with aliases, e.g. "pytorch", "react", "k8s→kubernetes").
6. **Score** against my resume (0–100): skill overlap between resume skills and job skills, weighted toward title matches, plus a bonus for my levels/regions. The resume only *ranks*; it never hides postings. Recompute all scores when the resume changes.
7. **Alert** new postings that pass my alert rules (§5).
8. **Seeding rule:** the first successful fetch of any source is stored silently (no alerts), so adding a company never floods me with old postings.

## 5. Alerts (Telegram)

- `npm run telegram:setup` reads `getUpdates` and prints my chat ID after I message the bot.
- One message per posting for the top matches, HTML formatted: **role**, company, location, level, match %, "posted X min ago", and the direct apply link as a button/link.
- Rules (editable in Settings): which levels and regions to alert on, minimum match %, max alerts per run (overflow becomes one summary message with counts + dashboard link), quiet hours (IST) during which alerts are queued and sent afterwards.
- Respect Telegram rate limits (≈1 msg/s per chat); retry on 429 using `retry_after`.
- "Send test alert" button in Settings.
- Discord webhook as an optional second channel using the same formatter.

## 6. Pages (dashboard)

0. **Home (Radar)**: the ref-00 layout described in §8d — hero + search over a live map of new postings, stat cards, For You gradient card, Recommended job cards with match rings, then Attention / Freshness / Volume widgets.
1. **Feed**: all new postings, newest first. Filters: keyword, level, region, company, group, posted within (1h / 24h / 7d / 30d), tech-only toggle. Each row: title, company, location, level/region chips, match %, freshness ("12 min ago"), apply link, star. Clicking a row opens a side panel with the description and extracted skills.
2. **For You**: same list ranked by match %, with "why it matched" (shared skills) on each row.
3. **Starred / Applied**: a simple pipeline: Saved → Applied → Interview → Offer/Rejected, with dates. This tracks my applications so I can see my speed-to-apply.
4. **Research & Programs**: cards/table with status (open / closed / expected), typical window, deadline if known, last page change, official link.
5. **Market Insights** (from the stored postings):
   - new tech postings per day (last 30/90 days)
   - top hiring companies (last 30 days) and companies that went quiet
   - most-demanded skills and **rising skills** (this 30 days vs previous 30)
   - intern vs new-grad vs experienced volume; India vs remote vs abroad
   - **my skill gap**: top in-demand skills missing from my resume
   - average time a posting stays open (from first_seen → inactive)
6. **Settings**: resume upload (PDF, or paste text) with the extracted skills shown as editable chips; alert rules; Telegram/Discord status and test button; **Source Health** (every source with status, last success, job count, last error) and "Add company".

Use server-side filtering with URL search params and paginate (100 per page).

## 7. Database (libSQL)

Tables: `jobs` (id, source, company_key, company, title, location, url, description, posted_at, first_seen_at, last_seen_at, active, level, region, is_tech, category, skills JSON, score, notified, starred, status, dedupe_key), `sources` (key, name, kind, config JSON, status, last_ok, last_error, job_count, seeded, last_discovery), `programs` (id, hash, snippet, status, last_checked, last_changed), `kv` (settings, profile/resume, ETags), `runs` (started_at, finished_at, new_jobs, alerted, errors). Add indexes on first_seen_at, posted_at, company_key, dedupe_key. Migrations run automatically on first connection.

## 8. UI design system

Reference screenshots are in `design-refs/`. **Copy their layout, structure and visual language — not their content, logos, names or numbers.** Every element below is already mapped to what it becomes in this app.

### 8a. Which reference drives what

- **`ref-00-primary-job-match.png` is the primary reference.** It sets the overall look of the app: soft, airy, light-grey canvas, a map behind the header, large white cards with big radii, pill controls, round icon buttons, big numbers with small superscript deltas, gradient feature cards, and job cards with a circular match-score ring. When in doubt, match this one.
- `ref-01-dashboard-dark.png` drives **dark mode** (same layouts as ref-00, recoloured with its tokens) and the **dense data widgets** that ref-00 doesn't have: the alerts panel, the freshness table and the volume histogram.
- `ref-02` … `ref-04` (Mondragon) are **secondary layout ideas only**, used on three screens: the job detail panel (ref-02 split + key–value rows + full-width black button), the Research page (ref-03 wide split cards with a vertical edge tab), and the Market page header (ref-04 giant numerals with captions). Render them in the ref-00 style (Inter, soft radii), **not** in Mondragon's monospace uppercase.

### 8b. Tokens

**Light (default, from ref-00)**
- Canvas `#F2F3F5` with a very light map behind the top section; cards `#FFFFFF`; subtle card shadow `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)`; hairline borders `#ECEDEF` only where needed.
- Text `#0B0B0C`; secondary `#8A8D93`; tertiary/labels `#B4B7BC`.
- **Accent: one blue** — gradient `#3B8BFF → #1F6BFF` for the active nav pill and primary actions; solid `#2F7BFF` for links/selection.
- **Feature gradients (max two places per screen):** "For You" card = orange → pink → purple (`#FF9F6B → #F55AA0 → #B46CF2`) with a soft wave shape; "Top pick" job card = green → teal → blue (`#9BE15D → #4FD1C5 → #3B8BFF`). Everything else stays white/grey.
- **Signal colours** (only to carry meaning): green `#34C759` new/fresh/positive, orange `#FF9F43` closing soon/warning (also the map cluster rings), red `#FF453A` critical/failing and the notification dot.

**Dark (from ref-01)**
- Background `#0B0B0C`, cards `#141416`, raised `#1C1C1F`, borders `#26262A`, text `#F4F4F5`, secondary `#8A8A92`. Keep the same accent, gradients and signal colours. Dark map style.

**Shape and spacing**
- Card radius **28px** (big cards) / 20px (small cards and job cards); pills fully rounded; round icon buttons 44–48px with a 1px border (the `↗`, `★`, `✕`, send, locate buttons in ref-00).
- Generous padding (24–32px inside cards), 16–20px gaps. Dense views (Feed list mode, tables) tighten to 12px.

### 8c. Typography

- **Inter** only. Headings weight 500, letter-spacing −0.05em; body weight 400, −0.04em; secondary weight 300. Only weights 500 / 400 / 300.
- **Two-tone hero title** like ref-00: first word in weight 300 secondary grey, second line in 500 black ("Your / Opportunity Radar").
- **Big numbers**: 40–48px weight 500 with a small superscript delta or percentage in secondary grey (`4131 ⁵⁴%`, `8,574 ⁺³⁷`). Match score inside the ring at ~32px weight 400.
- Tabular numerals (`font-variant-numeric: tabular-nums`) for all stats and times.

### 8d. Home screen — `RADAR` (built from ref-00)

Top to bottom:

1. **Top bar**: left = round **refresh** button ("poll now", tooltip shows "Last sync 2 min ago") + avatar (opens profile/resume). Centre = pill nav with icons: **Home · Feed · For You · Research · Market · Pipeline**; the active pill gets the blue gradient, others are white pills. Right = round **bell** button with red dot for unseen alerts (dropdown = recent alerts, mirroring what went to Telegram).
2. **Hero over the map** (left half):
   - Title: "Your" (300, grey) + pill chip `● Live · synced 2m ago` (green dot) on the same line as ref-00's "AI-Powered" chip, then **"Opportunity Radar"** (500).
   - **Search bar** pill with two dropdown segments: 🔍 role/keyword ("AI/ML Intern ⌄") | 📍 location ("India ⌄" — India, Remote, Worldwide, or a city). Submitting opens Feed with those filters.
   - **Map controls** under it: locate/recenter, compass/north, zoom `+` as round white buttons.
3. **Map background** (full-bleed behind the header, faded at the edges): MapLibre GL JS with a free, keyless light style (OpenFreeMap "positron" — **verify**; dark style in dark mode). Pins = **company logo badges** for postings first seen in the last 24h; **orange ring dots** = clusters / cities with several new roles. Hover a pin → small white card: company, role count, newest role, "4m ago". Default view: India, with a "World" toggle. Geocode via a bundled lookup of ~300 major tech cities.
4. **Stat cards** (right side, bento like ref-00), each with a round `↗` button that deep-links into the filtered Feed:
   - **New today** (big card): two numbers side by side, **Intern** `124 ⁺³⁸%` and **New grad** `46 ⁺¹²%`, plus a mini bar chart of postings per hour.
   - **Hiring momentum** (small card): this week's tech postings ÷ 4-week average, e.g. `1.18 ⁺⁰·⁰⁶`.
   - **Open roles tracked** (small card): `8,574 ⁺³⁷` (new in the last hour) with a mini line sparkline.
   - **For You** gradient card (tall, orange→pink→purple, wave graphic): "✦ For You ›" / "View your **top matches**". Before a resume is uploaded it reads "Upload your resume to unlock matches".
5. **Recommended** section: title "Recommended" + a row of **dropdown filter pills**: `Posted: Last hour / Today / This week` · `Region: India / Remote / Abroad` · `Level: Intern / New grad / Research` · `Domain: AI/ML / Software / Data / Hardware / Quant` · `Company group`. (Show a `Stipend/Salary` pill only if that data exists for the result set.)
6. **Job cards** (3 per row, like ref-00):
   - Company logo (favicon service `https://www.google.com/s2/favicons?domain={domain}&sz=64`, monogram fallback), **role title** (500), "Company • 6 h ago" (secondary).
   - Top-right round buttons: **★ star** (save to Pipeline) and **✕ dismiss** (hide; optional "hide similar from this company").
   - Chips: stipend/salary (only if known), type (Internship / Full-time), level, location, Remote/Hybrid/On-site, and `NEW` (green) if < 1 hour old.
   - Round **send button** (paper plane) = **Apply**: opens the apply link in a new tab and asks "Mark as applied?" (moves it into Pipeline). Long-press/menu: "Send to Telegram".
   - **Match ring** on the right: circular progress with the score in the centre; dashed track for the remaining part, as in ref-00. Without a resume, show the freshness ("12m") instead.
   - The **first card is the "Top pick"** (highest score among postings < 24h) with the green→blue gradient background and white text, exactly like the Amazon card in ref-00.
7. Below Recommended (dark-mode-ready widgets from ref-01, restyled as white ref-00 cards in light mode): **Attention** panel (closing-soon deadlines in orange/red rows, programs that just opened, unseen ≥80% matches, failing sources), **Freshness** card (average alert latency posted→alerted as the big number + small table), **Posting volume** histogram (30 days).

### 8e. Other screens

- **Feed**: same filter-pill row as Home. View toggle: **Cards** (the ref-00 job card, 3-up) / **List** (compact 48px rows: logo · title · company · chips · match ring (small) · "4m" · ★ · ✕) — default to List here because Feed is high-volume. Infinite scroll. Keyboard: `j/k` move, `o` apply, `s` star, `x` dismiss, `/` search, `esc` close.
- **For You**: card view by default, sorted by match; each card shows "why it matched" (2–3 shared-skill chips).
- **Job detail panel** (opens on card click, slides from the right, ~42% width; layout from ref-02 in ref-00 styling): logo + title + company, tag chips, big match ring with skill breakdown (matched skills in blue chips, missing skills in grey), description, **key–value rows with hairline dividers** (Posted · First seen · Location · Level · Source · Alerted at), full-width black **Apply now →** button, then ★ / Mark applied / Send to Telegram.
- **Research**: page title in the two-tone hero style ("Research / & Programs"); filter pills (Open now · Opening soon · India · Abroad); one **wide split card per program** (ref-03 layout): left = soft generative gradient block seeded by program id (no stock photos), right = name, org · country, two-line summary, status chip (`Open` green / `Opens ~Jan` grey / `Closes in 3 days` orange), key–value rows (window, eligibility, last page change), and a vertical edge tab "Apply ›".
- **Market**: header band in the ref-04 pattern rendered in ref-00 style: 3–4 giant numbers with captions ("+18% AI/ML postings, 30d", "412 new roles this week", "2.1× India intern demand vs last month"); below, a bento grid of chart cards (postings per day, top hiring companies, rising skills, level and region split, **your skill gap** as chips with demand bars).
- **Pipeline**: board with columns Saved → Applied → Interview → Offer / Rejected; cards are a compact version of the job card with dates and "applied X h after posting".
- **Settings**: white cards for Resume (drag-and-drop PDF, extracted skills as editable chips), Alerts (rules as pill toggles + "Send test alert"), Telegram/Discord connection status, Source health table, Add company.
- **Empty / first-run state**: hero title over the map, plus a single gradient card "Start tracking — upload your resume · connect Telegram" with two pill buttons.

### 8f. Behaviour and build order

- Freshness is the hero signal: relative times everywhere, green `NEW` chip and a soft pulse on map pins < 15 min old.
- Motion is subtle: 150–200ms fades/lifts on hover, ring fill and number count-up on load, map pin drop-in. Respect `prefers-reduced-motion`.
- Responsive: on mobile the map shrinks to a 16:9 card under the hero, stat cards become a 2-column grid, job cards stack, and the nav becomes a bottom pill bar.
- Use Tailwind CSS with the tokens above as CSS variables (light/dark via `class` strategy). Charts with Recharts (thin lines, rounded bars, no gridline clutter, no legend for single series).
- **Build the component library first** — `PillNav`, `IconButton` (round), `FilterPill` (dropdown), `StatCard` (big number + superscript delta + sparkline), `GradientCard`, `JobCard` (+ `TopPick` variant), `MatchRing`, `Chip`, `KeyValueRow`, `AlertRow`, `MapPin`, `SearchPill` — plus a `/design` page showing every component in both themes. **Stop and let me compare it against `ref-00` before building pages.**

## 9. Phases (stop after each one)

1. **Foundation**: project setup, `CLAUDE.md`, DB + migrations, Greenhouse/Lever/Ashby/SmartRecruiters/Workday/Amazon/Simplify adapters with fixture tests, company registry + auto-discovery, worker `--once/--loop/--health`. Output: a run summary in the terminal.
2. **Alerts**: classification, dedupe, seeding rule, Telegram (+ Discord) with rules, test alert, setup script.
3. **Design system + dashboard**: tokens, fonts, component library and `/design` page (stop here for my review against the refs), then Home, Feed, For You, job detail panel, Settings (resume upload + skills, alert rules, source health, add company).
4. **Insights & research**: Research & Programs page + page watcher, Market page, live map on Home, Pipeline board, empty/first-run state.
5. **Deploy**: Turso + Vercel + GitHub Actions workflow (`*/5` cron, secrets), README with step-by-step setup, `.env.example`.
6. **Later (don't build yet)**: free Gemini API for JD summaries, cold-email drafts to professors, resume-bullet tailoring; daily email digest; Hacker News "Who is hiring" via Algolia API; startup funding-news feed.

## 10. Definition of done

- `npm run worker -- --once` completes with a per-source report and no crashes even when sources fail.
- A new posting appears on Telegram within one poll interval of being visible at the source.
- Source Health shows which companies work and which need fixing.
- Uploading my resume changes the For You ranking immediately.
- `npm run build` passes; typecheck passes; adapter tests pass.
- Light mode closely matches `ref-00`; dark mode applies ref-01's tokens to the same layouts; no reference content is copied.
- README explains setup in under 10 steps, all on free tiers.
