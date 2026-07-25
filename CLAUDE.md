# Origin Point Play — Claude Code Reference

## Metadata & Links
- **Purpose:** Broadcast support for HockeyEttan Södra (Grästorps IK). Stats briefing dashboard + vMix GT Designer backup API (domain swap compatible).
- **Production URL:** https://spdproduktion.se
- **GitHub:** Lilling587/hockeyettan-stats
- **Lovable ID:** b5d9d92f-3d6c-4d04-99c2-25be99cec0a2

## Tech Stack & Commands
- **Framework:** TanStack Start (Router + Query) + React 19
- **DB & Storage:** Supabase (PostgreSQL), Storage bucket: `vmix-assets` (only)
- **Styling & Deploy:** Tailwind CSS v4, shadcn/ui, Cloudflare Workers via Lovable
- **Scraping & PM:** Firecrawl (JS-rendered fallback), `bun` (never npm/pnpm)

## Git Workflow (CRITICAL)
- **Rules:** Commit directly to `main`. `git push` immediately.
- **Banned:** NO pull requests, force-pushes, rebasing, amending, or squashing (breaks Lovable sync).

## Project Constants
- **Grästorps IK ID:** 570 (Default team) | **2025-26 Comp ID:** 18271
- **Rate Limit:** 120 req/min per IP (internal exempt)
- **Cache:** Bumps via `CACHE_VERSION` in `stats.functions.ts`
- **vMix Slots:** 32 per team (GK1-2, LD1-5, RD1-5, XD1-5, LW1-5, C1-5, RW1-5)
- **vMix Keys:** `{team}_{position}{slot}_{field}.{type}` (e.g., `H_GK1_name.Text`)

## Architecture & Scraping Rules
- **Standings:** Static during broadcast, scraped at publish time.
- **Dagens Matcher:** Live scraping per request (~30s cache).
- **Schedules:** Use Firecrawl (`scrapeMd`) for last-5-games. Direct fetch misses JS-rendered rounds.
- **Team Mapping:** Use `team-short-names.ts` (`fetchTeamCodeMap`). No network fetch needed.
- **Storage Filenames:** ASCII-safe only (e.g., GRÄ -> GRA, MÖR -> MOR).
- **Scraper Resiliency:** Use `fetchWithTimeout` (10s) + `withRetry` (3 attempts, exponential backoff).
- **Markdown Cleansing:** Strip links: `.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")` before regex.
- **Tables:** Special teams page has 2 tables (Scoring + Goalkeeping). Split on `</table>`.
- **Regex Rules:** 
  - Team cells: `<span title="Full Name"><strong>ABBR</strong></span>` -> use `titleRe` for full name.
  - vMix lineup sections: `/<h3>\s*([^<(]+?)\s*\([^)]*\)/` (accepts any text in parentheses).

## Schema Changes (TeamBriefing)
1. Add new field with `.nullable().default(null)` in `stats.functions.ts`.
2. Add to `emptyTeam()` in `stats.server.ts`.
3. Populate in `buildBriefing`.
4. Bump `CACHE_VERSION` (e.g., v16 -> v17).

## Strict Banned Practices
- Do not use `www.` in production URL.
- Do not modify `public/briefing-anchors.json` structure (Stream Deck dependency).
- Do not use standard `supabase` client for admin; use `supabaseAdmin` (service role).
- Do not reference legacy storage buckets (`logos`, `team-logos`).
- Do not bump `CACHE_VERSION` without updating `emptyTeam()`.