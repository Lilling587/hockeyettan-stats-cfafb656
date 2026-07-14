# Origin Point Play – Broadcast Reference Document
*Last updated: July 2026*

---

## 1. What Is This App and Why Does It Exist?

**Origin Point Play** is a broadcast support tool built for HockeyEttan Södra coverage at Grästorps IK. It serves two purposes:

**Purpose 1: Match Briefing**
The main dashboard scrapes stats.swehockey.se and produces a comprehensive pre-game briefing for producers and commentators: head-to-head history, current form, top scorers, goalie stats, special teams percentages, power play data, and more. The dashboard supports Stream Deck navigation via URL anchors (see Section 8).

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

---

## 3. Code Change Workflow

**All code changes go via the GitHub web editor, committing directly to main.**

Lovable credits are reserved for architectural changes requiring coordinated multi-file changes or database migrations. Simple edits, bug fixes, label changes, and endpoint modifications go through GitHub's web editor for free. The GitHub-to-Lovable sync is automatic via webhook — commit in GitHub, wait ~2–3 minutes, the app is deployed.

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

| Endpoint | Backup URL | Mirrors |
|---|---|---|
| Lineup | `/api/public/vmix/lineup/0?ClubId=570` | `/api/lineup/0?ClubId=570` |
| Standings | `/api/public/vmix/standings` | `/api/tabel/` |
| Current (metadata) | `/api/public/vmix/current` | N/A (internal) |

**Planned endpoints (not yet implemented):**
- Today's games (with live results)
- Players (lower thirds for interviews)
- Title card (pre-broadcast graphic)

Switching from primary to backup in vMix requires only changing the domain in the data source URL. All field names, data types, and response structure are identical.

### 4.3 Performance: Active Publication Cache

The `getActivePublication` function uses a **30-second in-memory cache** to reduce Supabase queries during broadcast polling. vMix polls every 5–15 seconds per endpoint — without caching that's 4–12+ queries per minute. The cache is invalidated immediately on publish, unpublish, or restore, so vMix sees fresh data within one poll cycle after any change.

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

**Standings are static during broadcast.** They are scraped from swehockey at publish time and stored in the publication. No live standings refresh is needed or implemented — the table doesn't change during a game unless another division game finishes, and even then the backup is meant for emergency use, not real-time accuracy.

### 4.6 Switching Between Primary and Backup in vMix

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

The admin page uses **collapsible cards** — setup/debugging cards start collapsed and are expanded when needed, keeping the page clean during broadcast. Cards that are always visible: Datakälla, the two lineup editors, and the sticky publish bar.

### 7.1 Draft Auto-Save

The form state (teams, slots, venue, notes) is automatically saved to `localStorage` every 5 seconds. If the browser crashes or the tab is closed before publishing, a restore banner appears on the next visit with "Återställ utkast" and "Ignorera" buttons. The draft is cleared on successful publish.

### 7.2 Datakälla Card

Handles which game's data is loaded. Auto-detects Grästorps IK home games from the swehockey schedule.

Status badges: AUTO (green) — home game found; AUTO (outlined) — no game today; LIVE — active publication hydrated; MANUELL (amber) — manual override active.

Two buttons: "Använd manuell inmatning" (resets form for manual setup) and "Använd dagens hittade match" (re-runs auto-detection, visible in manual/live modes only).

### 7.3 Logotypkoder Card (collapsible)

Shows every team's logo code in a compact list with inline editing. "Synka från Swehockey" button fetches codes. Manual overrides show a "manuell" badge. Shows team count badge when collapsed.

### 7.4 vMix-endpoints Card (collapsible)

Reference list of endpoint URLs with copy buttons. Used during setup to paste URLs into vMix data sources.

### 7.5 Endpoint Tester Card (collapsible)

Tests endpoints with status badges, response times, and scrollable JSON preview. "Testa alla" for on-demand testing, "Auto 10s" for continuous monitoring. Auto-fetches when a home game is detected.

### 7.6 Publication History Card (collapsible)

Shows the last 5 publications with timestamps, team names, and player counts. The active publication has a green "LIVE" badge. Past publications have an "Återställ" button for instant rollback. Starts collapsed.

### 7.7 Lineup Editor Cards (Hemmalag / Bortalag)

Each card contains:
- **Team dropdown** — Auto-fills the Logotypkod from the codes database.
- **Logotypkod field** — Editable, auto-filled on team change.
- **"Ladda spelarlistan" button** — Fetches roster from swehockey.se, populates slot dropdowns. Does NOT fill slots — the producer picks players deliberately.
- **Roster status badge** — Amber "Roster ej laddad" or green "26 spelare" in the card header.
- **Persistent error banner** — If roster loading fails, a red banner shows the error message until the next successful load.
- **Slot grid** — MÅLVAKTER (2 slots), BACKPAR (5×3: LD, RD, XD), FORWARDS (5×3: LW, C, RW). Each slot has a dropdown (populated after roster load) and text inputs for manual entry.
- **Mobile responsive** — Team selector and logotypkod fields stack properly on small screens.

### 7.8 Lineup-mallar Card (collapsible)

Save and restore lineup presets for repeat matchups. "Spara mall" stores the current lineup with a label. "Ladda" restores a saved preset. "Ta bort" deletes. Stored in the `vmix_lineup_presets` database table.

### 7.9 Sticky Bottom Bar

- **Completeness warnings** — Amber warnings for missing goalkeepers, too few skaters, or missing logo codes. Non-blocking — the producer can still publish.
- **"Publicera till vMix"** — Opens a confirmation dialog showing team names, player counts, and any warnings. On confirm, publishes data, fetches/enriches standings, activates the publication.
- **"Avpublicera"** — Deactivates the publication.
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

**Hardware setup:** A Lenovo ThinkCentre M720Q (i5-8400T, 8 GB RAM) with a 15.6" portable USB-C touchscreen at the commentator box. Chrome with bookmarked tabs for stats and admin. The commentators tap through stats sections; the producer uses the same screen for lineup management between periods.

---

## 9. Roster Scraping

### 9.1 How `scrapeTeamRoster` Works

Located in `vmix.server.ts`. Fetches the swehockey `TeamRoster/{competitionId}` page and extracts player data.

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

`scrapeTeamCodes` in `vmix.server.ts` fetches the same roster page but only parses the navigation links (`<a href="#GRÄ">Grästorps IK</a>`). Returns a `Record<string, string>` mapping team names to codes.

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

Stored in `src/lib/seasons.config.ts`. New seasons are detected automatically via the season detection banner on the dashboard.

---

## 11. Supabase Tables

| Table | Purpose | Access |
|---|---|---|
| `vmix_publications` | Active and historical publications. `home_slots`, `away_slots` (JSONB), `standings_json` (JSONB), `is_active` (boolean). | Anon: SELECT active only. Admin: all. |
| `team_logo_codes` | Team name → logo code mapping with source tracking. | Admin only. |
| `vmix_lineup_presets` | Saved lineup templates for repeat matchups. | Admin only. |
| `season_detections` | Pending/confirmed/dismissed season detections. | Admin only. |
| `season_overrides` | Confirmed seasons added via the banner UI. | Admin only. |
| `season_check_meta` | Throttle state for season scan. | Admin only. |

---

## 12. Error Handling

### 12.1 `throwIfSupabaseError` Helper

All Supabase database operations use a standardized error helper:

```typescript
function throwIfSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
```

This replaces the previously inconsistent `if (error) throw new Error(error.message)` pattern throughout `vmix.functions.ts`.

### 12.2 Roster Loading Errors

When roster scraping fails, a persistent error banner appears on the affected lineup card (not just a transient toast). The banner stays visible until the next successful roster load, ensuring the producer doesn't miss the failure during pre-broadcast setup.

---

## 13. File Structure

```
src/
├── lib/
│   ├── seasons.config.ts        ← competitionId per season
│   ├── seasons.server.ts        ← Season detection logic
│   ├── vmix.functions.ts        ← Types, server functions (publish, unpublish,
│   │                               presets, publication history, team logo codes,
│   │                               roster fetch, active publication cache)
│   ├── vmix.server.ts           ← Scrapers (roster, team codes)
│   ├── vmix-assets.ts           ← Asset URL resolution, ASCII-safe logo codes,
│   │                               Supabase Storage integration
│   ├── stats.server.ts          ← StandingRow type, fetchFullStandings,
│   │                               briefing scrapers
│   ├── team-logos.functions.ts   ← Team logo admin functions
│   ├── team-logos.server.ts      ← Logo scraping/caching from hockeyettan.se
│   └── team-logo-upload.ts       ← Logo file upload to Supabase Storage
│
├── routes/
│   ├── index.tsx                 ← Dashboard, season detection banner
│   ├── auth.tsx                  ← Login page (redirects to / after login)
│   ├── _authenticated/
│   │   ├── route.tsx             ← Auth guard, redirect logic
│   │   ├── admin.vmix.tsx        ← vMix admin page (lineup editor, standings,
│   │   │                           endpoint tester, team codes, presets,
│   │   │                           publication history, draft auto-save)
│   │   ├── admin.logos.tsx        ← Team logo management page
│   │   └── admin.health.tsx       ← Scraper health monitoring
│   └── api/
│       └── public/
│           └── vmix/
│               ├── lineup.$version.ts  ← Lineup backup endpoint
│               ├── standings.ts        ← Standings backup endpoint
│               └── current.ts          ← Game metadata endpoint
│
├── integrations/
│   └── supabase/
│       ├── client.ts              ← Browser Supabase client
│       ├── client.server.ts       ← Server Supabase client (service role)
│       └── auth-middleware.ts     ← requireSupabaseAuth middleware
│
├── components/
│   ├── dashboard/
│   │   ├── briefing-view.tsx      ← Stats briefing with section anchors
│   │   └── pending-seasons-banner.tsx
│   └── ui/                        ← shadcn/ui components (skeleton, alert-dialog,
│                                     badge, card, button, etc.)
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
2. If a draft exists from a previous session, choose "Återställ utkast" or "Ignorera"
3. Datakälla card shows auto-detected matchup (or use "Använd manuell inmatning")
4. Verify Logotypkod is filled for both teams
5. Press "Ladda spelarlistan" on both lineup cards — verify green badges
6. Fill each slot from the dropdown using the actual game lineup sheet
7. Check amber warnings in the sticky bar — resolve any issues
8. Press "Publicera till vMix" → review the confirmation dialog → confirm
9. Review the diff summary in the sticky bar
10. Expand the endpoint tester → "Testa alla" — verify both green
11. Check the JSON preview — confirm player names and logo URLs
12. In vMix: if primary API fails, change domain to `hockeyettan-stats.spdproduktion.se`
13. Enable "Auto 10s" in the endpoint tester to monitor throughout broadcast
14. If a mistake is found: expand Publiceringshistorik → "Återställ" on the correct publication

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
| Supabase Storage bucket | `vmix-assets` (public) |
| Default team | `Grästorps IK` (hardcoded as `DEFAULT_TEAM`) |
| Briefing anchors | `public/briefing-anchors.json` |

---

## 16. Future Plans

- **Additional backup endpoints:** Today's games (with live results), Players (lower thirds for interviews), Title card (pre-broadcast graphic) — all mirroring official Swehockey vMix API formats.
- **Bitfocus Companion integration:** Stream Deck XL buttons for one-press switching between primary and backup data sources in vMix.
- **Commentator mini PC:** Lenovo ThinkCentre M720Q (i5-8400T) with 15.6" portable USB-C touchscreen for the commentator box.

---

*End of reference document.*
