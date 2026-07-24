# Origin Point Play — Claude Code Reference

## What This App Does

Broadcast support tool for HockeyEttan Södra coverage at Grästorps IK. Two purposes:
1. **Commentator briefing dashboard** — scrapes stats.swehockey.se for pre-game prep
2. **vMix GT Designer backup** — mirrors official Swehockey API endpoints so vMix only needs a domain swap to switch from primary to backup

**Production URL:** https://hockeyettan-stats.spdproduktion.se
**GitHub repo:** Lilling587/hockeyettan-stats
**Lovable project ID:** b5d9d92f-3d6c-4d04-99c2-25be99cec0a2

---

## Tech Stack

- **Framework:** TanStack Start (TanStack Router + TanStack Query) + React 19
- **Database:** Supabase (PostgreSQL)
- **Asset storage:** Supabase Storage (vmix-assets bucket only)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Deployment:** Cloudflare Workers via Lovable
- **Scraping:** Firecrawl (JS-rendered pages) + direct fetch fallback
- **Package manager:** bun (use bun, not npm or pnpm)

---

## Git Workflow — CRITICAL

- Always commit directly to **main** branch
- **NEVER create pull requests**
- Always push after committing (`git push`)
- **PERMANENTLY BANNED:** force-pushing, rebasing, amending pushed commits, squashing pushed commits — these break the Lovable↔GitHub bidirectional sync
- Lovable picks up commits automatically via GitHub App webhook within ~1 minute

---

## Key Files

```
src/lib/
  stats.server.ts          — main briefing builder, all scrapers, HTML parsers
  stats.functions.ts       — TanStack server functions + Zod schemas + CACHE_VERSION
  game-flow.server.ts      — per-game event scraping, lineup parsing, shot data
  game-flow.functions.ts   — server function wrappers for game flow
  vmix.server.ts           — roster scraper, vMix slot logic
  vmix.functions.ts        — vMix server functions including fetchTonightsLineup
  vmix-assets.ts           — logo URL resolution, ASCII-safe team codes
  team-short-names.ts      — full team name → abbreviation map (e.g. "Grästorps IK" → "GRÄ")
  dashboard-utils.ts       — TeamData type, helper functions
  seasons.config.ts        — competition IDs per season
  rate-limiter.ts          — per-IP rate limiting for public endpoints

src/routes/
  index.tsx                — briefing dashboard (home page)
  _authenticated/
    admin.vmix.tsx         — vMix admin (lineup editor, publish)
    admin.assets.tsx       — asset management
    admin.users.tsx        — user management
  api/public/vmix/
    lineup.$version.ts     — vMix backup endpoint
    standings.ts           — vMix backup endpoint
    titlecard.ts           — vMix backup endpoint
    todays-games.ts        — vMix backup endpoint
    player.ts              — vMix backup endpoint

src/components/dashboard/cards/  — all briefing card components
```

---

## Important Constants

- **Grästorps IK club ID:** 570
- **2025-26 competition ID:** 18271
- **Default team:** Grästorps IK
- **Cache version:** currently v16 in stats.functions.ts — bump when changing TeamBriefing schema
- **Rate limit:** 120 req/min per IP (internal requests exempt)
- **vMix slot positions:** GK1-2, LD1-5, RD1-5, XD1-5, LW1-5, C1-5, RW1-5 (32 slots per team)

---

## Architecture Decisions

- **Standings are static during broadcast** — scraped at publish time, not live
- **"Dagens Matcher"** uses live scraping on each request (~30s cache) since scores change in real time
- **Supabase Storage** for all image assets, ASCII-safe filenames (GRÄ→GRA, MÖR→MOR etc.)
- **schedule HTML** (`/ScheduleAndResults/Schedule/18271`) is partially JS-rendered — direct fetch only returns some rounds. Firecrawl (`scrapeMd`) returns the full schedule. Use Firecrawl-based parsers for last-5-games data, not `fetchAllScheduleGames`
- **`fetchTeamCodeMap`** uses `shortTeamName` + `KNOWN_TEAM_NAMES` — no network fetch needed
- **Team name → code mapping** is in `team-short-names.ts`, sourced from swehockey stats pages

---

## Scraping Patterns

- All scrapers use `fetchWithTimeout` (10s) + `withRetry` (3 attempts, exponential backoff)
- Firecrawl converts `<a href="...">text</a>` to `[text](url)` in markdown — strip with `.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")` before applying regex filters
- Special teams page has TWO tables (Scoring Efficiency + Goalkeeping Efficiency) — split on `</table>` to avoid cross-reads
- Team cells use `<span title="Full Name"><strong>ABBR</strong></span>` — use `titleRe` to extract full name
- vMix lineup page section regex: `/<h3>\s*([^<(]+?)\s*\([^)]*\)/` — accepts any `(text)` not just `(Red|White)`

---

## vMix API Structure

Key naming: `{team}_{position}{slot}_{field}.{type}`
Examples: `H_GK1_name.Text`, `A_LW3_number.Text`, `H_RD2_plate.Source`

Official API:
- Lineup: `https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570`
- Standings: `https://vmix-new.hockeyettan.se/api/tabel/`

Backup (same structure, domain swap only):
- `https://hockeyettan-stats.spdproduktion.se/api/public/vmix/lineup/0?ClubId=570`

---

## Schema Changes

When adding fields to `TeamBriefing` in `stats.functions.ts`:
1. Add the field with `.nullable().default(null)`
2. Add it to `emptyTeam()` in `stats.server.ts`
3. Populate it in `buildBriefing`
4. Bump `CACHE_VERSION` (e.g. v16 → v17) to invalidate cached briefings

---

## What NOT to Do

- Never force push or rebase pushed commits
- Never create pull requests — commit directly to main
- Never use `supabase` client for admin operations — use `supabaseAdmin` (service role)
- Never add `www.` to production URL
- Never modify `public/briefing-anchors.json` structure — Stream Deck depends on it
- The `vmix-assets` bucket is the ONLY storage bucket in use — do not reference old buckets (logos, team-logos)
- Don't bump CACHE_VERSION without also updating `emptyTeam()` with the new fields
