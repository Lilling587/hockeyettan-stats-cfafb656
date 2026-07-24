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
- The `vmix-assets` bucket is the ONLY storage bucket in use — don't reference old buckets (logos, team-logos)
- Don't bump CACHE_VERSION without also updating `emptyTeam()` with the new fields