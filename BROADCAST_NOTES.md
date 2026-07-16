# Origin Point Play – Broadcast Reference Document
*Last updated: July 2026*

---

## 1. What Is This App and Why Does It Exist?

**Origin Point Play** is a broadcast support tool built for HockeyEttan Södra coverage at Grästorps IK. It serves two purposes:

**Purpose 1: Match Briefing**
The main dashboard scrapes stats.swehockey.se and produces a comprehensive pre-game briefing for producers and commentators: head-to-head history, current form, top scorers, goalie stats, special teams percentages, power play data, and more. The dashboard supports Stream Deck navigation via URL anchors (see Section 8). Features include auto-refresh (every 30 minutes when enabled) and a tablet-optimized mode for the commentator touchscreen.

**Purpose 2: vMix GT Designer Backup Data Source**
The primary data source for vMix broadcast graphics is the official Swehockey vMix API at `https://vmix-new.hockeyettan.se/api/`. This API experienced reliability issues during peak load (many simultaneous games across leagues) during the 2024-25 season. It also only serves data within a specific time window (2 hours before puck drop through 3 hours after). Outside that window it returns an error.

Origin Point Play acts as a **manual backup** — the producer publishes lineup and standings data through the admin UI before the game. If the real API fails during broadcast, vMix is switched to the backup endpoint by changing only the domain in the data source URL. The backup endpoints mirror the real API's URL structure and JSON field names exactly, so no template changes are needed in vMix GT Designer.

---

## 2. Technology Stack

| Component | Technology |
|---|---|
| Framework | TanStack Start (TanStack Router + TanStack Query) + React 19 |
| Database | Supabase (PostgreSQL via Lovable Cloud) |
| Asset Storage | Supabase Storage (public `vmix-assets` bucket) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Deployment | Cloudflare Workers (via Lovable) |
| Repository | `github.com/Lilling587/origin-point-play-0cae653e` |
| Lovable project ID | `b5d9d92f-3d6c-4d04-99c2-25be99cec0a2` |
| Production URL | `https://hockeyettan-stats.spdproduktion.se` |
| Email scheduling | pg_cron (via Lovable Supabase) with Resend |

---

## 3. Code Change Workflow

**All code changes go via the GitHub web editor, committing directly to main.**

Lovable credits are reserved for architectural changes requiring coordinated multi-file changes or database migrations. Simple edits, bug fixes, label changes, and endpoint modifications go through GitHub's web editor for free. The GitHub-to-Lovable sync is automatic via webhook — commit in GitHub, wait ~2–3 minutes, the app is deployed.

**Change format:** All code instructions use exact **delete this / replace with this** blocks — never "insert between". When modifying an existing line, the full original line is shown in the delete block and the full new line is shown in the replace block. Approximate line numbers are always included.

**Permanently banned operations:** Force-pushing, rebasing, amending pushed commits, and squashing pushed commits. These break the bidirectional Lovable ↔ GitHub sync.

---

## 4. The vMix Backup System

### 4.1 How the Real Swehockey API Works

The real API URL for lineup data:
```
https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
```

The real API URL for standings data:
```
https://vmix-new.hockeyettan.se/api/tabel/
```

Both return a **JSON array containing one flat object** with named keys for every graphic element. vMix GT Designer reads this flat structure and maps each key to a text box or image element in the broadcast template.

### 4.2 The Backup Endpoints

| Endpoint | Backup URL | Mirrors | Status |
|---|---|---|---|
| Lineup | `/api/public/vmix/lineup/0?ClubId=570` | `/api/lineup/0?ClubId=570` | ✅ Live |
| Standings | `/api/public/vmix/standings` | `/api/tabel/` | ✅ Live |
| Title card | `/api/public/vmix/titlecard` | N/A | ✅ Live |
| Today's games | `/api/public/vmix/todays-games` | N/A | ✅ Live |
| Player stats | `/api/public/vmix/player?PlayerName=LASTNAME,%20FIRSTNAME` | N/A | ✅ Live |
| Current (metadata) | `/api/public/vmix/current` | N/A (internal) | ✅ Live |

All public endpoints are rate-limited to 120 requests/minute per IP (via `rate-limiter.ts`).

Switching from primary to backup in vMix requires only changing the domain in the data source URL. All field names, data types, and response structure are identical.

### 4.3 Performance: Active Publication Cache

The `getActivePublication` function uses a **30-second in-memory cache** to reduce Supabase queries during broadcast polling. vMix polls every 5–15 seconds per endpoint — without caching that's 4–12+ queries per minute. The cache is invalidated immediately on publish, unpublish, restore, or standings refresh, so vMix sees fresh data within one poll cycle after any change.

HTTP caching: `Cache-Control: public, max-age=30, stale-while-revalidate=60` on lineup, standings, and titlecard endpoints. Today's games uses `max-age=60, stale-while-revalidate=120`. Player uses `max-age=300, stale-while-revalidate=600`.

### 4.4 Lineup JSON Structure

The lineup endpoint returns all player data for both teams in one flat object. Key naming convention:

```
{team}_{position}{slot}_{field}.{type}
```

Examples:
- `H_GK1_name.Text` — Home team, Goalkeeper slot 1, player name
- `A_LW3_number.Text` — Away team, Left Wing slot 3, jersey number
- `H_RD2_plate.Source` — Home team, Right Defender slot 2, plate image URL

Each team has 32 named slots:

| Section | Slots | Purpose |
|---|---|---|
| Goalkeepers | GK1, GK2 | 2 side-by-side |
| Left Defenders | LD1–LD5 | Left column of BACKPAR |
| Right Defenders | RD1–RD5 | Right column of BACKPAR |
| Extra Defenders | XD1–XD5 | Third column (rarely used) |
| Left Wings | LW1–LW5 | Left column of FORWARDS |
| Centers | C1–C5 | Middle column of FORWARDS |
| Right Wings | RW1–RW5 | Right column of FORWARDS |

Empty slots have `_plate.Source` set to `""` — GT Designer makes them completely invisible.

Additional fields: `A_TeamName.Text`, `A_TeamLogo.Source`, `A_LogoTeam.Source`, `H_TeamName.Text`, `H_TeamLogo.Source`, `H_LogoTeam.Source`, `HeadlineGoalies.Text`, `HeadlineDef.Text`, `HeadlineForw.Text`, `BG.Source`, `Divider1.Source`, `Divider2.Source`, `Divider3.Source`.

**Note:** The `$version` parameter in the URL (`/lineup/0`, `/lineup/1`, etc.) is accepted but ignored — all versions return the same data. Use `0` to match the official API.

### 4.5 Standings JSON Structure

The standings endpoint returns all 20 team rows in one flat object. Key naming convention (zero-padded 01–20):

```
Pos{NN}.Text        — Position number (integer)
Team{NN}t.Text      — Team name (note lowercase 't' before .Text)
M{NN}.Text          — Games played (integer)
D{NN}.Text          — Goal difference (integer, can be negative)
P{NN}.Text          — Points (integer)
Team{NN}.Source     — Logo URL
Frame{NN}.Source    — Logo URL (duplicate, used for frame layer)
```

Static header fields: `Headline.Text`, `Rubrik1.Text` (both set to `"HOCKEYETTAN SÖDRA"`), `Mrubrik.Text` (`"M"`), `Mrubrik1.Text` (`"+/-"`), `Mrubrik2.Text` (`"P"`).

Separator lines (NOT zero-padded, 1–20): `SolidLine{N}.Text` and `DottedLine{N}.Text`. Most are a single space `" "` (invisible). Active lines:
- `SolidLine6.Text` = `"_________________________________________"` (qualification cutoff)
- `DottedLine10.Text` = `"--------------------------------------------------------------------"` (playoff cutoff)
- `DottedLine18.Text` = `"--------------------------------------------------------------------"` (relegation to HockeyTvåan)

**Standings are static during broadcast** but can be refreshed independently via the "Uppdatera tabell" button in the sticky bar, which re-scrapes swehockey and updates only the `standings_json` column without touching the lineup. Useful when another Södra game finishes before puck drop.

### 4.6 Title Card JSON Structure

The titlecard endpoint returns game metadata for a pre-broadcast graphic:

```
HomeTeam.Text       — Home team name (uppercase)
AwayTeam.Text       — Away team name (uppercase)
HomeTeamShort.Text  — Home team logo code
AwayTeamShort.Text  — Away team logo code
GameDate.Text       — Formatted date (e.g., "15 OKT")
Venue.Text          — Venue name
League.Text         — "HOCKEYETTAN SÖDRA"
```

### 4.7 Today's Games JSON Structure

The todays-games endpoint scrapes the swehockey live page and returns all games scheduled for today:

```
GamesCount.Text     — Number of games today
Game01Home.Text     — First game home team
Game01Away.Text     — First game away team
Game01Score.Text    — Score (e.g., "3 - 2") or empty if not started
Game01Status.Text   — Status string from swehockey (e.g., "Klart")
Game02Home.Text     — Second game...
```

Games are zero-padded (01, 02, etc.). Returns an empty object on days without games.

### 4.8 Player Stats JSON Structure

The player endpoint returns individual season statistics for lower-third graphics:

```
/api/public/vmix/player?PlayerName=SVENSSON,%20ERIK
```

```
Name.Text           — Full name
Team.Text           — Team name
Position.Text       — Position code
Goals.Text          — Goals this season
Assists.Text        — Assists this season
Points.Text         — Total points
GamesPlayed.Text    — Games played
```

Returns 404 if the player is not found in the current season's statistics.

### 4.9 Switching Between Primary and Backup in vMix

```
Real:   https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
Backup: https://hockeyettan-stats.spdproduktion.se/api/public/vmix/lineup/0?ClubId=570
```

Only the domain changes. Both GT Designer inputs (home and away) query the same URL — one reads `H_` prefixed fields, the other reads `A_` prefixed fields.

---

## 5. Asset Storage (Supabase Storage)

All broadcast image assets (team logos, background graphics, plate resources) are stored in a **public Supabase Storage bucket** called `vmix-assets`. vMix loads images directly from the internet via Supabase's CDN.

### 5.1 Bucket Structure

```
vmix-assets/
  logos/
    GRA_small.png       ← Grästorps IK (ASCII-safe: GRÄ → GRA)
    GRA_large.png
    KHK_small.png       ← Karlskrona HK
    KHK_large.png
    MOR_small.png       ← Mörrums GoIS IK (ASCII-safe: MÖR → MOR)
    ...
  resources/
    lineup-PLATE.png    ← Blue number badge for filled player slots
    transparent.png     ← 1×1 transparent placeholder
    lineupBG.png        ← Lineup graphic background
    lineup-DIVISION.png ← Section divider line
```

### 5.2 ASCII-Safe Logo Filenames

The `vmix-assets.ts` module converts team codes to ASCII by stripping diacritics before building URLs (`toVmixLogoFileCode`). This avoids encoding issues with Swedish characters in file URLs.

| Team code (from swehockey) | Filename on Supabase |
|---|---|
| GRÄ | GRA_small.png / GRA_large.png |
| MÖR | MOR_small.png / MOR_large.png |
| VÄS | VAS_small.png / VAS_large.png |
| MJÖ | MJO_small.png / MJO_large.png |
| KHK | KHK_small.png / KHK_large.png (no change) |

When uploading new logos, always rename files with Swedish characters to their ASCII equivalents.

### 5.3 Asset Base URL Resolution

The `resolveVmixAssetBaseUrl` function in `vmix-assets.ts` determines where asset URLs point:

- If `asset_base_url` is empty or a private IP (`192.168.x.x`, `10.x.x.x`, `localhost`) → automatically uses the Supabase Storage public URL
- If `asset_base_url` is a public HTTPS URL → uses that URL directly

The `asset_base_url` is hardcoded as empty in `SETTING_DEFAULTS`, which means Supabase Storage is always used. No manual URL configuration needed.

---

## 6. Team Logo Codes System

Team logo codes map team names to their short codes (e.g., "Grästorps IK" → "GRÄ"). These codes are used to construct logo file URLs in both the lineup and standings endpoints.

### 6.1 Database Table: `team_logo_codes`

| Column | Type | Purpose |
|---|---|---|
| team_name | TEXT (unique) | Full team name from swehockey |
| logo_code | TEXT | Short code (e.g., "GRÄ", "KHK") |
| source | TEXT | `"scraped"` (from swehockey) or `"manual"` (producer override) |
| updated_at | TIMESTAMPTZ | Last modification time |

### 6.2 Syncing from Swehockey

The `scrapeTeamCodes` function in `vmix.server.ts` extracts team codes from the swehockey roster page navigation links (`<a href="#GRÄ">Grästorps IK</a>`). The "Synka från Swehockey" button in the Logotypkoder card triggers this scrape and upserts the results into the database.

Manual overrides (codes set by the producer via the "Ändra" button) are preserved during sync — only `source: "scraped"` rows are updated.

### 6.3 Auto-Fill in the Admin Page

When the producer selects a team, a combined team-sync + auto-fill `useEffect` (using `useRef` to track the previous team) looks up the team's code from the cached codes map and auto-fills the Logotypkod field. The field remains editable for per-session overrides.

### 6.4 Enrichment at Publish Time

When the producer publishes, the `publishVmix` function reads all logo codes from `team_logo_codes`, attaches each team's `logoCode` to their standings row, and stores the enriched standings in the publication. The standings endpoint reads these embedded codes to build logo URLs.

---

## 7. The Admin vMix Page (`/admin/vmix`)

The admin page uses **collapsible cards** — setup/debugging cards start collapsed and are expanded when needed, keeping the page clean during broadcast. Cards that are always visible: Förberedelsekontroll (readiness), Datakälla, the two lineup editors, and the sticky publish bar. Each major card is wrapped in a **CardErrorBoundary** — if one card crashes, the rest of the page (including the publish bar) remains functional.

### 7.1 Session & Navigation Safety

- **Session expiry warning:** An amber banner appears 5 minutes before the Supabase JWT expires, prompting the producer to re-authenticate before the session dies mid-broadcast.
- **`beforeunload` guard:** If any lineup slots are filled, the browser shows a "Leave site?" confirmation when closing or navigating away, preventing accidental data loss.
- **Supabase Realtime:** All open admin tabs subscribe to `postgres_changes` on `vmix_publications`. Any publish/unpublish/restore from another device or tab instantly updates all other open tabs.

### 7.2 Förberedelsekontroll (Readiness Card)

A compact card at the very top showing go/no-go status for all critical systems: away team selected, active publication present, lineup completeness for both teams (MV count + skater count), and logo codes synced. Uses green/amber/red icons. The card border changes color based on overall status.

### 7.3 Draft Auto-Save

The form state (teams, slots, venue, notes) is automatically saved to `localStorage` every 5 seconds. If the browser crashes or the tab is closed before publishing, a restore banner appears on the next visit with "Återställ utkast" and "Ignorera" buttons. The draft is cleared on successful publish.

### 7.4 Datakälla Card

Handles which game's data is loaded. Auto-detects Grästorps IK home games from the swehockey schedule.

Status badges: AUTO (green) — home game found; AUTO (outlined) — no game today; LIVE — active publication hydrated; MANUELL (amber) — manual override active.

Two buttons: "Använd manuell inmatning" (resets form — shows confirmation dialog if slots are already filled) and "Använd dagens hittade match" (re-runs auto-detection, visible in manual/live modes only).

### 7.5 Season Selector

A small dropdown above the Datakälla card lets the producer select which season's competition ID to use for roster scraping. The current season is pre-selected. Previous seasons remain accessible for reference.

### 7.6 Logotypkoder Card (collapsible)

Shows every team's logo code in a compact list with inline editing. "Synka från Swehockey" button fetches codes. Manual overrides show a "manuell" badge. Shows team count badge when collapsed.

### 7.7 vMix-endpoints Card (collapsible)

Reference list of endpoint URLs with copy buttons. Includes all 6 endpoints (lineup, standings, titlecard, todays-games, player, current). Used during setup to paste URLs into vMix data sources.

### 7.8 Endpoint Tester Card (collapsible)

Tests all endpoints with status badges, response times, and scrollable JSON preview. "Testa alla" for on-demand testing, "Auto 10s" for continuous monitoring. When "Auto 10s" is active and an endpoint transitions from OK to error, a toast alert fires immediately. Auto-fetches when a home game is detected.

### 7.9 Publication History Card (collapsible)

Shows the last 5 publications with timestamps, team names, and player counts. The active publication has a green "LIVE" badge. Past publications have an "Återställ" button for instant rollback. Shows loading skeletons while data loads. Starts collapsed.

### 7.10 Granskningslogg (Audit Log Card, collapsible)

Shows the last 20 audit events: publish, unpublish, restore, and standings refresh. Each entry shows the action type, team names (if applicable), and timestamp. The `vmix_audit_log` table records every action with the user ID who performed it.

### 7.11 Lineup Editor Cards (Hemmalag / Bortalag)

Each card contains:
- **Team dropdown** — Auto-fills the Logotypkod from the codes database.
- **Logotypkod field** — Editable, auto-filled on team change.
- **"Ladda spelarlistan" button** — Fetches roster from swehockey.se with 10-second timeout and automatic retry (up to 3 attempts with exponential backoff). Populates slot dropdowns. Does NOT fill slots — the producer picks players deliberately.
- **Roster status badge** — Amber "Roster ej laddad" or green "26 spelare" in the card header.
- **Persistent error banner** — If roster loading fails, a red banner shows the error message until the next successful load.
- **Slot grid** — MÅLVAKTER (2 slots), BACKPAR (5×3: LD, RD, XD), FORWARDS (5×3: LW, C, RW). Each slot has a dropdown (populated after roster load) and text inputs for manual entry.
- **Mobile responsive** — Team selector and logotypkod fields stack properly on small screens.

### 7.12 Lineup-mallar Card (collapsible)

Save and restore lineup presets for repeat matchups. Presets are filtered by the currently selected teams — shows only matching presets when teams are selected, with a count of hidden presets. "Spara mall" stores the current lineup with a label. "Ladda" restores a saved preset. "Ta bort" deletes. Shows loading skeletons while data loads. Stored in the `vmix_lineup_presets` database table.

### 7.13 Sticky Bottom Bar

- **Completeness warnings** — Amber warnings for missing goalkeepers, too few skaters, or missing logo codes. Non-blocking — the producer can still publish.
- **"Publicera till vMix"** — Opens a confirmation dialog showing team names, player counts, and any warnings. Server-side validation additionally blocks publish if lineup is completely empty, logo codes are missing, or standings scrape returns fewer than 8 teams. On confirm, publishes data, fetches/enriches standings, activates the publication.
- **"Avpublicera"** — Opens a confirmation dialog with red danger styling warning that vMix will lose the backup connection immediately. No longer fires on click — requires explicit confirmation.
- **"Uppdatera tabell"** — Re-scrapes standings from swehockey and updates only the standings_json column of the active publication without touching lineup slots. Shows spinner while in progress.
- **"Exportera JSON"** — Downloads the current live lineup endpoint response as a local `.json` file for backup or debugging.
- **Timestamp** — "Publicerad 2026-10-15 18:30 · inkl. tabell"
- **Diff summary** — After publishing, shows detailed changes vs. the previous publication: ＋ (added), － (removed), ↔ (changed) per slot.

---

## 8. Commentator Dashboard & Stream Deck Navigation

The stats briefing page (`/`) has `id` attributes on every section for URL anchor navigation. A Stream Deck (via Bitfocus Companion) can have buttons that open specific URLs, scrolling the browser to the relevant section instantly.

The anchor definitions are published in `public/briefing-anchors.json` for easy Companion setup.

| Anchor | Section | URL |
|---|---|---|
| `#form` | Form / senaste matcher | `https://hockeyettan-stats.spdproduktion.se/#form` |
| `#venue` | Hemma/bortasvit | `.../#venue` |
| `#periods` | Periodmål | `.../#periods` |
| `#h2h` | Inbördes möten | `.../#h2h` |
| `#scorers` | Poängligor | `.../#scorers` |
| `#goalies` | Målvakter | `.../#goalies` |
| `#shots` | Skottvolym | `.../#shots` |
| `#special` | Specialteam | `.../#special` |
| `#probability` | Vinstprognos | `.../#probability` |
| `#hot` | Hetaste spelarna | `.../#hot` |
| `#streaks` | Sviter & varningar | `.../#streaks` |
| `#discipline` | Utvisningar | `.../#discipline` |

### Dashboard Features

- **Auto-refresh toggle:** "Auto på/av" button appears after loading stats. When enabled, stats are refreshed automatically every 30 minutes.
- **Tablet mode:** A "Tablet/Normal" toggle button switches to larger text and more spacing, optimized for the 15.6" touchscreen at the commentator box.
- **Keyboard shortcuts:** `1` = Briefing tab, `2` = Recap tab, `L` = Load stats, `R` = Refresh, `P` = Print, `?` = Show shortcuts.

**Hardware setup:** A Lenovo ThinkCentre M720Q (i5-8400T, 8 GB RAM) with a 15.6" portable USB-C touchscreen at the commentator box. Chrome with bookmarked tabs for stats and admin. The commentators tap through stats sections; the producer uses the same screen for lineup management between periods.

---

## 9. Roster Scraping

### 9.1 How `scrapeTeamRoster` Works

Located in `vmix.server.ts`. Fetches the swehockey `TeamRoster/{competitionId}` page and extracts player data.

**Resilience:** All fetch calls to swehockey use `fetchWithTimeout` (10-second `AbortController`) and `withRetry` (3 attempts, exponential backoff: 500ms → 1000ms → 2000ms). This handles both hanging connections and transient 503 errors without blocking the Cloudflare Worker.

**Team block extraction:** Uses a two-stage approach:
1. **Primary:** Looks for a `<h1>`–`<h6>` heading containing the team name
2. **Secondary:** Looks for an `<a id="CODE">` anchor fragment near the team name

Block boundaries are determined by finding the next `<h>` heading or next `<a id="...">` anchor, whichever comes first. This prevents cross-team data contamination. If neither match succeeds, the function returns an empty array — never falls back to broad text search.

**Row filtering:**
- Rows with fewer than 4 non-empty cells are skipped (catches summary/average rows)
- Header text patterns skipped: "nr", "name", "pos", "avg", "genomsnitt", "total", etc.
- Pure numeric "names" skipped (e.g., "22.6" from averages rows)
- Names shorter than 2 characters skipped

**Position detection:** Scans all cells for known position codes (`GK`, `MV`, `LD`, `RD`, `LW`, `CE`, `RW`) using regex, rather than relying on a fixed column index.

### 9.2 Team Code Scraping

`scrapeTeamCodes` in `vmix.server.ts` fetches the same roster page but only parses the navigation links (`<a href="#GRÄ">Grästorps IK</a>`). Returns a `Record<string, string>` mapping team names to codes. Also uses `fetchWithTimeout` and `withRetry`.

### 9.3 Live Games Scraping

`scrapeLiveGames` in `vmix.server.ts` fetches the swehockey live page (`/ScheduleAndResults/Live/{competitionId}`) and extracts today's game results. Parses HTML table rows for team names, scores, and game status. Returns an empty array on off-season days or when no games are scheduled.

---

## 10. Configuration

### 10.1 Hardcoded Constants

Settings were previously stored in a `vmix_settings` database table but are now hardcoded since the values never change:

| Setting | Value | Used by |
|---|---|---|
| `asset_base_url` | `""` (empty → Supabase Storage) | Both endpoints, via `resolveVmixAssetBaseUrl` |
| `club_id` | `"570"` | Lineup endpoint (validates `?ClubId=` parameter) |
| `lineup_version` | `"0"` | Admin page endpoint tester URL display |

These are defined in `SETTING_DEFAULTS` in `vmix.functions.ts` and returned by `readVmixSettings()`.

### 10.2 The competitionId System

Every competition in Swehockey's database has a unique numeric ID. For HockeyEttan Södra 2025-26, this is `18271`.

Stored in `src/lib/seasons.config.ts`. New seasons are detected automatically via the season detection banner on the dashboard. The admin page also has a manual season selector for roster scraping.

### 10.3 Rate Limiting

All public vMix endpoints are rate-limited to 120 requests/minute per IP via `src/lib/rate-limiter.ts`. Uses an in-memory counter per Cloudflare Worker instance. Returns HTTP 429 with `Retry-After: 60` when exceeded. Stale buckets are pruned when the map exceeds 5000 entries.

### 10.4 Scheduled Tasks

| Task | Schedule | Mechanism |
|---|---|---|
| Pre-game emails | Configurable | pg_cron → `/api/public/hooks/pregame-emails` |
| Post-game emails | Configurable | pg_cron → `/api/public/hooks/postgame-emails` |

Both hooks require `Authorization: Bearer <CRON_SECRET>` header. The `CRON_SECRET` environment variable is set in Lovable project settings.

---

## 11. Supabase Tables

| Table | Purpose | Access |
|---|---|---|
| `vmix_publications` | Active and historical publications. `home_slots`, `away_slots` (JSONB), `standings_json` (JSONB), `is_active` (boolean). Realtime enabled. | Anon: SELECT active only. Admin: all. |
| `team_logo_codes` | Team name → logo code mapping with source tracking. | Admin only. |
| `vmix_lineup_presets` | Saved lineup templates for repeat matchups. | Admin only. |
| `vmix_audit_log` | Audit trail of publish/unpublish/restore/refresh actions with user ID and details. | Admin only (read). Server functions (write). |
| `season_detections` | Pending/confirmed/dismissed season detections. | Admin only. |
| `season_overrides` | Confirmed seasons added via the banner UI. | Admin only. |
| `season_check_meta` | Throttle state for season scan. | Admin only. |

---

## 12. Error Handling & Resilience

### 12.1 `throwIfSupabaseError` Helper

All Supabase database operations use a standardized error helper:

```typescript
function throwIfSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
```

### 12.2 Roster Loading Errors

When roster scraping fails, a persistent error banner appears on the affected lineup card (not just a transient toast). The banner stays visible until the next successful roster load, ensuring the producer doesn't miss the failure during pre-broadcast setup.

### 12.3 Scraper Resilience

All external fetch calls use:
- **`fetchWithTimeout`:** 10-second `AbortController` timeout. Prevents hanging connections from blocking the Cloudflare Worker.
- **`withRetry`:** Up to 3 attempts with exponential backoff (500ms → 1s → 2s). Handles transient swehockey 503 errors silently.

### 12.4 Server-Side Publish Validation

The `publishVmix` server function validates before writing:
- At least one home slot must be filled
- Home and away team logo codes must be non-empty
- If standings were scraped but contain fewer than 8 teams, publish is blocked (partial data guard)

### 12.5 Per-Card Error Boundaries

Each major card on the vMix admin page is wrapped in a `CardErrorBoundary` class component. If a card's JavaScript crashes, it shows a minimal error fallback with a "Försök igen" button — the rest of the page (including the sticky publish bar) remains fully functional.

### 12.6 Audit Logging

The `logAuditEvent` helper writes to `vmix_audit_log` on every publish, unpublish, restore, and standings refresh. It's non-blocking — audit failures are silently ignored and never break the main operation. Each entry records: action type, publication ID, team names, user ID, and a details JSONB column.

---

## 13. File Structure

```
src/
├── lib/
│   ├── seasons.config.ts        ← competitionId per season
│   ├── seasons.server.ts        ← Season detection logic
│   ├── vmix.functions.ts        ← Types, server functions (publish, unpublish,
│   │                               refreshStandings, presets, publication history,
│   │                               team logo codes, roster fetch, active
│   │                               publication cache, audit log, player stats,
│   │                               today's games)
│   ├── vmix.server.ts           ← Scrapers (roster, team codes, live games),
│   │                               fetchWithTimeout, withRetry helpers
│   ├── vmix-assets.ts           ← Asset URL resolution, ASCII-safe logo codes,
│   │                               Supabase Storage integration
│   ├── rate-limiter.ts          ← In-memory per-IP rate limiting for public
│   │                               endpoints (120 req/min)
│   ├── stats.server.ts          ← StandingRow type, fetchFullStandings,
│   │                               briefing scrapers, fetchAllLeaguePlayers
│   ├── stats.functions.ts       ← Server function wrappers (listTeams,
│   │                               listSeasons, getMatchupBriefing, etc.)
│   ├── roles.functions.ts       ← checkIsAdmin server function
│   ├── error-reporter.ts        ← Client-side error reporting utility
│   ├── error-messages.ts        ← Swedish error message translations
│   ├── preferences.ts           ← localStorage helpers (favorite team,
│   │                               active tab)
│   ├── team-logos.functions.ts   ← Team logo admin functions
│   ├── team-logos.server.ts      ← Logo scraping/caching from hockeyettan.se
│   └── team-logo-upload.ts       ← Logo file upload to Supabase Storage
│
├── routes/
│   ├── index.tsx                 ← Dashboard (briefing, recap, season picker,
│   │                               auto-refresh, tablet mode, keyboard shortcuts)
│   ├── auth.tsx                  ← Login page (redirects to / after login)
│   ├── schema.tsx                ← Schedule page
│   ├── spelare.tsx               ← Player stats page
│   ├── compare.tsx               ← HockeyEttan stats comparison page
│   ├── _authenticated/
│   │   ├── route.tsx             ← Auth guard, redirect logic
│   │   ├── admin.vmix.tsx        ← vMix admin page (readiness card, lineup
│   │   │                           editor, standings refresh, endpoint tester,
│   │   │                           team codes, presets, publication history,
│   │   │                           audit log, draft auto-save, session expiry
│   │   │                           warning, error boundaries, season selector)
│   │   ├── admin.logos.tsx        ← Team logo management page
│   │   ├── admin.health.tsx       ← Scraper health monitoring
│   │   ├── admin.users.tsx        ← User management
│   │   ├── admin.assets.tsx       ← Supabase Storage asset management
│   │   └── admin.logs.tsx         ← Application logs
│   └── api/
│       └── public/
│           ├── hooks/
│           │   ├── pregame-emails.ts   ← Pre-game email webhook (pg_cron)
│           │   └── postgame-emails.ts  ← Post-game email webhook (pg_cron)
│           └── vmix/
│               ├── lineup.$version.ts  ← Lineup backup endpoint (rate-limited)
│               ├── standings.ts        ← Standings backup endpoint (rate-limited)
│               ├── titlecard.ts        ← Title card endpoint (rate-limited)
│               ├── todays-games.ts     ← Today's live games endpoint (rate-limited)
│               ├── player.ts           ← Player stats endpoint (rate-limited)
│               └── current.ts          ← Game metadata endpoint
│
├── integrations/
│   └── supabase/
│       ├── client.ts              ← Browser Supabase client
│       ├── client.server.ts       ← Server Supabase client (service role)
│       ├── admin-middleware.ts    ← requireAdmin middleware
│       └── auth-middleware.ts     ← requireSupabaseAuth middleware
│
├── components/
│   ├── dashboard/
│   │   ├── briefing-view.tsx      ← Stats briefing with section anchors
│   │   ├── pending-seasons-banner.tsx
│   │   ├── season-picker.tsx
│   │   ├── searchable-team-picker.tsx
│   │   ├── briefing-skeleton.tsx
│   │   └── cards/
│   │       └── next-match-card.tsx
│   ├── admin-nav.tsx              ← Admin page navigation
│   ├── theme-toggle.tsx           ← Dark/light mode toggle
│   └── ui/                        ← shadcn/ui components
│
└── public/
    └── briefing-anchors.json      ← Anchor definitions for Stream Deck setup
```

---

## 14. Pre-Broadcast Workflow

### Before Season Starts (One-Time Setup)
1. Verify `competitionId` in seasons config (or confirm via season detection banner)
2. Go to `/admin/vmix` → expand Logotypkoder → "Synka från Swehockey"
3. Review synced codes, manually adjust any that don't match logo filenames
4. Upload logo files to Supabase Storage `vmix-assets/logos/` (ASCII-safe names)
5. Upload resource files to `vmix-assets/resources/`
6. Set up Companion buttons for Stream Deck using `public/briefing-anchors.json`

### Game Day
1. Open `/admin/vmix`
2. Check the Förberedelsekontroll card — all items should be green before broadcast
3. If a draft exists from a previous session, choose "Återställ utkast" or "Ignorera"
4. Datakälla card shows auto-detected matchup (or use "Använd manuell inmatning")
5. Verify Logotypkod is filled for both teams
6. Press "Ladda spelarlistan" on both lineup cards — verify green badges
7. Fill each slot from the dropdown using the actual game lineup sheet
8. Check amber warnings in the sticky bar — resolve any issues
9. Press "Publicera till vMix" → review the confirmation dialog → confirm
10. Review the diff summary in the sticky bar
11. Expand the endpoint tester → "Testa alla" — verify all green
12. Check the JSON preview — confirm player names and logo URLs
13. In vMix: if primary API fails, change domain to `hockeyettan-stats.spdproduktion.se`
14. Enable "Auto 10s" in the endpoint tester to monitor throughout broadcast
15. If standings change before puck drop, press "Uppdatera tabell" to refresh without republishing
16. If a lineup mistake is found: fix the slot → "Publicera" again, or expand Publiceringshistorik → "Återställ" on a correct previous publication
17. Use "Exportera JSON" to download a local copy of the current lineup data for backup

---

## 15. Quick Reference

| Item | Value |
|---|---|
| Competition ID (2025-26) | `18271` |
| Club ID (Grästorps IK) | `570` |
| Lineup version | `0` |
| Official lineup API | `https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570` |
| Official standings API | `https://vmix-new.hockeyettan.se/api/tabel/` |
| Backup lineup | `https://hockeyettan-stats.spdproduktion.se/api/public/vmix/lineup/0?ClubId=570` |
| Backup standings | `https://hockeyettan-stats.spdproduktion.se/api/public/vmix/standings` |
| Backup titlecard | `https://hockeyettan-stats.spdproduktion.se/api/public/vmix/titlecard` |
| Backup today's games | `https://hockeyettan-stats.spdproduktion.se/api/public/vmix/todays-games` |
| Backup player stats | `https://hockeyettan-stats.spdproduktion.se/api/public/vmix/player?PlayerName=...` |
| Supabase Storage bucket | `vmix-assets` (public) |
| Default team | `Grästorps IK` (hardcoded as `DEFAULT_TEAM`) |
| Briefing anchors | `public/briefing-anchors.json` |
| Rate limit | 120 requests/minute per IP on all public endpoints |

---

## 16. Future Plans

- **Broadcast countdown timer:** Show time until puck drop on both the main dashboard and the vMix admin page.
- **Official API health badge:** Monitor the real Swehockey vMix API and display a status badge so the producer knows whether the backup is needed before the broadcast starts.
- **Post-game "Avsluta sändning":** One-click button to unpublish the lineup, clear the draft, and trigger the post-game email hook.
- **Bitfocus Companion integration:** Stream Deck XL buttons for one-press switching between primary and backup data sources in vMix.

---

*End of reference document.*
