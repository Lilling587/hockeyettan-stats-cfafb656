# Origin Point Play – Broadcast Reference Document
*Last updated: July 2026*

---

## 1. What Is This App and Why Does It Exist?

**Origin Point Play** is a broadcast support tool built for HockeyEttan Södra coverage at Grästorps IK. It serves two purposes:

**Purpose 1: Match Briefing**
The main dashboard scrapes stats.swehockey.se and produces a comprehensive pre-game briefing for producers and commentators: head-to-head history, current form, top scorers, goalie stats, special teams percentages, power play data, and more.

**Purpose 2: vMix GT Designer Backup Data Source**
The primary data source for vMix broadcast graphics is the official Swehockey vMix API at `https://vmix-new.hockeyettan.se/api/`. This API experienced reliability issues during peak load (many simultaneous games across leagues) during the 2024-25 season. It also only serves data within a specific time window (2 hours before puck drop through 3 hours after). Outside that window it returns an error.

Origin Point Play acts as a **manual backup** — the producer publishes lineup and standings data through the admin UI before the game. If the real API fails during broadcast, vMix is switched to the backup endpoint by changing only the domain in the data source URL. The backup endpoints mirror the real API's URL structure and JSON field names exactly, so no template changes are needed in vMix GT Designer.

---

## 2. Technology Stack

| Component | Technology |
|---|---|
| Framework | TanStack Start + React 19 |
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

Switching from primary to backup in vMix requires only changing the domain in the data source URL. All field names, data types, and response structure are identical.

### 4.3 Lineup JSON Structure

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

Additional fields in the lineup JSON: `A_TeamName.Text`, `A_TeamLogo.Source`, `A_LogoTeam.Source`, `H_TeamName.Text`, `H_TeamLogo.Source`, `H_LogoTeam.Source`, `HeadlineGoalies.Text`, `HeadlineDef.Text`, `HeadlineForw.Text`, `BG.Source`, `Divider1.Source`, `Divider2.Source`, `Divider3.Source`.

### 4.4 Standings JSON Structure

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

### 4.5 Switching Between Primary and Backup in vMix

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

The `vmix-assets.ts` module converts team codes to ASCII by stripping diacritics before building URLs. This avoids encoding issues with Swedish characters in file URLs.

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

- If `asset_base_url` in settings is empty or a private IP (`192.168.x.x`, `10.x.x.x`, `localhost`) → automatically uses the Supabase Storage public URL
- If `asset_base_url` is a public HTTPS URL → uses that URL directly

This means no manual URL configuration is needed when using Supabase Storage — leave the setting empty and it works automatically.

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

The `scrapeTeamCodes` function in `vmix.server.ts` extracts team codes from the swehockey roster page navigation links (`<a href="#GRÄ">Grästorps IK</a>`). The "Synka från Swehockey" button in the admin page's Logotypkoder card triggers this scrape and upserts the results into the database.

Manual overrides (codes set by the producer via the "Ändra" button) are preserved during sync — only `source: "scraped"` rows are updated.

### 6.3 Auto-Fill in the Admin Page

When the producer selects a team in the lineup editor dropdown, a `useEffect` looks up the team's code from the cached codes map and auto-fills the Logotypkod field. The field remains editable for per-session overrides. Changes to codes in the TeamCodesCard (permanent) are reflected on next team selection.

### 6.4 Enrichment at Publish Time

When the producer publishes, the `publishVmix` function:
1. Fetches standings from swehockey
2. Reads all logo codes from `team_logo_codes`
3. Attaches each team's `logoCode` to their standings row
4. Stores the enriched standings in the publication

The standings endpoint reads these embedded codes to build logo URLs without needing database access.

---

## 7. The Admin vMix Page (`/admin/vmix`)

### 7.1 Datakälla Card

Handles which game's data is loaded. When the page opens, it checks swehockey.se for Grästorps IK home games today.

Status badges:
- **AUTO (green)** — Home game found, rosters loaded
- **AUTO (outlined)** — No home game today
- **LIVE** — Active publication exists, form shows that data
- **MANUELL (amber)** — Producer chose to override

Two buttons:
- **"Använd manuell inmatning"** — Resets both teams, clears all slots and roster pools. The producer then picks teams in the lineup editor dropdowns and loads rosters manually.
- **"Använd dagens hittade match"** — Re-runs auto-detection from the schedule (visible only in manual or live-hydrated mode).

### 7.2 Logotypkoder Card

Shows every team's logo code in a compact list with inline editing. "Synka från Swehockey" button fetches codes from the swehockey roster page. Teams with manual overrides show a "manuell" badge and are preserved during sync.

### 7.3 vMix-inställningar Card

Three settings stored in `vmix_settings`:
- **Asset Base URL** — Leave empty for Supabase Storage (recommended). Only set if using a custom CDN.
- **Club ID** — `570` (Grästorps IK). Used to validate incoming vMix requests.
- **Lineup Version** — `0` (the path parameter in the API URL).

### 7.4 Lineup Editor Cards (Hemmalag / Bortalag)

Each card contains:
- **Team dropdown** — Selects the team. Auto-fills the Logotypkod from the codes database.
- **Logotypkod field** — Shows the team's logo code. Read from database, editable for overrides.
- **"Ladda spelarlistan" button** — Fetches the full roster from swehockey.se and populates the slot dropdowns. Does NOT fill any slots — the producer picks players deliberately.
- **Slot counter** — Shows "X MV · Y utespelare" in the card header.
- **Slot grid** — MÅLVAKTER (2 slots), BACKPAR (5×3: LD, RD, XD), FORWARDS (5×3: LW, C, RW). Each slot has a dropdown (populated after roster load) and text inputs for manual entry.

### 7.5 Endpoint Tester Card

Tests both endpoints with status badges, response times, and scrollable JSON preview (no character truncation). "Testa alla" for on-demand testing, "Auto 10s" for continuous monitoring. Auto-fetches when a home game is detected.

### 7.6 Sticky Bottom Bar

- **"Publicera till vMix"** — Saves all data, fetches and enriches standings, activates the publication. Endpoints immediately serve this data.
- **"Avpublicera"** — Deactivates the publication. Endpoints return error responses.

---

## 8. Roster Scraping

### 8.1 How `scrapeTeamRoster` Works

Located in `vmix.server.ts`. Fetches the swehockey `TeamRoster/{competitionId}` page and extracts player data.

**Team block extraction:** Uses a two-stage approach:
1. **Primary:** Looks for a `<h1>`–`<h6>` heading containing the team name
2. **Secondary:** Looks for an `<a id="CODE">` anchor fragment near the team name (swehockey uses these for page navigation, e.g., `<a id="GRÄ">`)

Block boundaries are determined by finding the next `<h>` heading or next `<a id="...">` anchor, whichever comes first. This prevents cross-team data contamination.

The old fallback (searching for the team name anywhere in the HTML) was removed because it matched team names in the "Youth club" column of other teams' rosters, causing wrong-team player data.

**Row filtering:**
- Rows with fewer than 4 non-empty cells are skipped (catches summary/average rows)
- Header text patterns are skipped: "nr", "name", "pos", "avg", "genomsnitt", "total", etc.
- Pure numeric "names" are skipped (e.g., "22.6" from averages rows)
- Names shorter than 2 characters are skipped

**Position detection:** Scans all cells in each row for known position codes (`GK`, `MV`, `LD`, `RD`, `LW`, `CE`, `RW`) using regex, rather than relying on a fixed column index.

### 8.2 Team Code Scraping

`scrapeTeamCodes` in `vmix.server.ts` fetches the same roster page but only parses the navigation links at the top (`<a href="#GRÄ">Grästorps IK</a>`). Returns a `Record<string, string>` mapping team names to codes.

---

## 9. The competitionId System

Every competition in Swehockey's database has a unique numeric ID. For HockeyEttan Södra 2025-26, this is `18271`.

Stored in `src/lib/seasons.config.ts`:
```typescript
export const SEASONS: Season[] = [
  { label: "2025-26", competitionId: "18271" },
];
```

New seasons are detected automatically via the season detection banner on the dashboard. The banner guides the producer through confirming the new competitionId. Confirmed seasons are stored in the `season_overrides` Supabase table and merged with `seasons.config.ts` at runtime.

---

## 10. Supabase Tables

| Table | Purpose | Access |
|---|---|---|
| `vmix_publications` | Active and historical publications. `home_slots`, `away_slots` (JSONB), `standings_json` (JSONB), `is_active` (boolean). | Anon: SELECT active only. Admin: all. |
| `vmix_settings` | Key-value config: `asset_base_url`, `club_id`, `lineup_version`. | Anon: SELECT whitelisted keys only. Admin: all. |
| `team_logo_codes` | Team name → logo code mapping with source tracking. | Admin only. |
| `season_detections` | Pending/confirmed/dismissed season detections. | Admin only. |
| `season_overrides` | Confirmed seasons added via the banner UI. | Admin only. |
| `season_check_meta` | Throttle state for season scan. | Admin only. |

### RLS Policy Notes

`vmix_settings` has a targeted anon-read policy that only exposes three specific keys (`asset_base_url`, `club_id`, `lineup_version`) to anonymous readers. All other potential keys are hidden from anon. This was done to allow the public endpoints to read settings without authentication while keeping any future sensitive settings protected.

`vmix_publications` allows anon SELECT only for rows where `is_active = true`. This lets vMix poll the active publication without authentication.

---

## 11. File Structure

```
src/
├── lib/
│   ├── seasons.config.ts        ← competitionId per season
│   ├── seasons.server.ts        ← Season detection logic
│   ├── vmix.functions.ts        ← Types, server functions (publish, unpublish,
│   │                               settings, team logo codes, roster fetch)
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
│   │   │                           settings, endpoint tester, team codes)
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
└── components/
    └── dashboard/
        └── pending-seasons-banner.tsx
```

---

## 12. Pre-Broadcast Workflow

### Before Season Starts (One-Time Setup)
1. Verify `competitionId` in seasons config (or confirm via season detection banner)
2. Go to `/admin/vmix` → Logotypkoder card → "Synka från Swehockey"
3. Review synced codes, manually adjust any that don't match your logo filenames
4. Upload logo files to Supabase Storage `vmix-assets/logos/` (ASCII-safe names)
5. Upload resource files to `vmix-assets/resources/`
6. Leave `asset_base_url` empty (Supabase Storage is used automatically)

### Game Day
1. Open `/admin/vmix`
2. Datakälla card shows auto-detected matchup (or use "Använd manuell inmatning" for away games)
3. Verify Logotypkod is filled for both teams
4. Press "Ladda spelarlistan" on both lineup cards
5. Fill each slot from the dropdown using the actual game lineup sheet
6. Press "Publicera till vMix"
7. Press "Testa alla" in the endpoint tester — verify both green
8. Check the JSON preview — confirm player names and logo URLs are correct
9. In vMix: if primary API fails, change domain to `hockeyettan-stats.spdproduktion.se`
10. Enable "Auto 10s" to monitor throughout the broadcast

---

## 13. Quick Reference

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

---

## 14. Future Plans

- **Raspberry Pi 5 deployment:** The app is intended to eventually run on a Pi 5 on the same LAN as the vMix broadcast PC, reducing internet dependency for the data endpoints (logos would still come from Supabase Storage).
- **Bitfocus Companion integration:** Stream Deck XL buttons for one-press switching between primary and backup data sources in vMix.

---

*End of reference document.*
