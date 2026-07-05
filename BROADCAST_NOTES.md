# Origin Point Play – Broadcast Reference Document
*Generated from project conversation – July 2026*

---

## 1. What Is This App and Why Does It Exist?

**Origin Point Play** is a pre-game briefing and stats tool built for HockeyEttan Södra broadcast production at Grästorps IK. It serves two distinct purposes:

**Purpose 1: Match Briefing (primary/original purpose)**
The main dashboard scrapes stats.swehockey.se and produces a comprehensive briefing for broadcast producers and commentators: head-to-head history, current form, top scorers, goalie stats, special teams percentages, power play data, hottest players, and more. This is what the home page (`/`) is built around.

**Purpose 2: vMix GT Designer Backup Data Source (newer purpose)**
The primary data source for vMix GT Designer graphics is the official Swehockey vMix API at:
```
https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
```
This API is unstable during peak load (many simultaneous games on the same day) and also only serves data within a specific time window – 2 hours before puck drop through 3 hours after the game ends. Outside that window it returns an error message.

The app therefore acts as a **manual backup** – a producer publishes lineup and standings data through the admin UI before the game, and if the real API fails, vMix is switched to the backup endpoint. The backup URL is designed to mirror the real API's URL structure exactly, so switching in vMix requires only changing the domain name.

---

## 2. Technology Stack

- **Framework:** TanStack Start + React 19
- **Database:** Supabase (PostgreSQL via Lovable Cloud)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Deployment:** Cloudflare Workers (via Lovable)
- **Repository:** `github.com/Lilling587/origin-point-play-0cae653e`
- **Lovable project ID:** `b5d9d92f-3d6c-4d04-99c2-25be99cec0a2`
- **Lovable workspace:** "Lilling's Lovable" (ID: `0Yc75YbIfKJrrpOkXVaJ`)

---

## 3. The Golden Rule: How to Make Code Changes

**All code changes go via the GitHub web editor, never via Lovable MCP or Lovable chat.**

This is a strict rule established early in the project for two reasons:

**Reason 1: Cost.** Lovable charges credits for every AI-generated change. Writing code directly in GitHub and letting Lovable sync it for free saves credits for genuine architectural work where you need Lovable's AI to figure something out.

**Reason 2: History integrity.** A bidirectional sync exists between GitHub and Lovable. Force-pushing, rebasing, amending pushed commits, or squashing pushed commits would corrupt this sync and potentially break the Lovable integration. These operations are permanently banned. Every commit is a forward-only addition to history.

**How the sync works:**
1. You commit a change in GitHub's web editor
2. GitHub fires a webhook to Lovable within seconds
3. Lovable pulls the updated code (10–60 seconds)
4. Lovable builds and deploys to Cloudflare Workers (1–3 minutes)
5. Your live app at the `lovable.app` domain is updated

You never need to press any button in Lovable – just commit to GitHub and wait roughly 2–3 minutes.

**When to spend Lovable credits:**
Reserve credits for architectural changes that touch multiple files simultaneously in a coordinated way, require database schema migrations, or involve complex UI that would be extremely tedious to write by hand. Examples: the slot-based lineup system rebuild, the vmix_settings table, new admin form grids.

**When to use GitHub directly (free):**
Simple edits, removing cards/sections, adding navigation links, changing labels, adding new endpoints that follow the exact same pattern as existing ones, fixing broken references, cleanup tasks.

---

## 4. The vMix Backup System – Architecture Overview

### 4.1 How the Real API Works

The real Swehockey vMix API is queried like this:
```
https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
```

Where:
- `0` is the template/format version (has been `0` the entire 2024-25 season, never changes)
- `ClubId=570` is Grästorps IK's club identifier in the Swehockey system

When queried within the active game window (2h before to 3h after), it returns a JSON **array** containing **one flat object** with named keys for every graphic slot for **both teams combined**. The key naming convention is:

```
{team}_{position}{slot}_{field}.{type}
```

Examples:
- `H_GK1_name.Text` – Home team, Goalkeeper slot 1, name field
- `A_LW3_number.Text` – Away team, Left Wing slot 3, number field
- `H_RD2_plate.Source` – Home team, Right Defender slot 2, plate image URL

Outside the active game window it returns:
```json
["Inga matcher startas inom 2h eller slutat för 3h sen! testa senare"]
```

### 4.2 The Full Slot Structure (Per Team)

Each team has 32 named slots:

| Section | Slots | Column in Graphic |
|---|---|---|
| Goalkeepers | GK1, GK2 | 2 side-by-side slots |
| Left Defenders | LD1–LD5 | Left column of BACKPAR |
| Right Defenders | RD1–RD5 | Right column of BACKPAR |
| Extra Defenders | XD1–XD5 | Third column of BACKPAR (rarely used) |
| Left Wings | LW1–LW5 | Left column of FORWARDS |
| Centers | C1–C5 | Middle column of FORWARDS |
| Right Wings | RW1–RW5 | Right column of FORWARDS |

When a slot is filled, its `_plate.Source` field gets a URL to the blue number badge image. When a slot is empty, `_plate.Source` is an empty string `""` and GT Designer hides the slot completely – it becomes invisible, not greyed out.

### 4.3 Player Name Format

Names are stored as **LASTNAME, FIRSTNAME** in uppercase throughout the entire system:
```
"SJÖKVIST, NOEL"
"VON DER GEEST, MARCUS"
"FORSBERG ZETTERSTRÖM, HUBERT"
```

The admin form auto-uppercases as you type. The roster scraper transforms names from whatever format swehockey.se uses to this format automatically.

### 4.4 The Image Asset URLs

All image URLs in the JSON use a base URL that points to the vMix computer's local web server. This is configurable in the admin page (see Section 6.1). The assets served from this local server include:

- `{baseUrl}/resources/lineup-PLATE.png` – the blue number badge shown next to each player
- `{baseUrl}/resources/transparent.png` – a transparent 1×1 pixel image used as a placeholder for player photos (no actual photos are used)
- `{baseUrl}/resources/lineupBG.png` – the background graphic
- `{baseUrl}/resources/lineup-DIVISION.png` – the divider line between sections
- `{baseUrl}/logos/{TEAMCODE}_small.png` – small team logo for the graphic header
- `{baseUrl}/logos/{TEAMCODE}_large.png` – large team logo for the graphic header

The `TEAMCODE` is a short string like `GRÄ` for Grästorp IK or `DAL` for HC Dalen. These codes must match the actual filenames of logo files on the vMix computer's web server.

### 4.5 How Switching Between Primary and Backup Works in vMix

The backup endpoint URL mirrors the real API URL structure exactly:

```
Real API:  https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
Backup:    https://[your-app].lovable.app/api/public/vmix/lineup/0?ClubId=570
```

Only the domain changes. In GT Designer's data source settings, you change only the domain part and everything else stays identical. Both GT Designer inputs (home team graphic and away team graphic) query the same URL – one input reads only the `H_` prefixed fields, the other reads only the `A_` prefixed fields.

---

## 5. The competitionId System

### 5.1 What Is competitionId?

Every competition in Swehockey's database has a unique numeric ID. For HockeyEttan Södra 2025-26, this ID is `18271`. This number appears in every URL your scraper uses:

```
https://stats.swehockey.se/ScheduleAndResults/Schedule/18271
https://stats.swehockey.se/ScheduleAndResults/Standings/18271
https://stats.swehockey.se/Teams/Info/TeamRoster/18271
https://stats.swehockey.se/Teams/Info/PlayersByTeam/18271
https://stats.swehockey.se/Teams/Statistics/ScoringAndGoalkeeping/18271
https://stats.swehockey.se/Teams/Statistics/PowerplayAndPenaltyKilling/18271
```

### 5.2 Where It's Stored

In `src/lib/seasons.config.ts`:
```typescript
export const SEASONS: Season[] = [
  { label: "2025-26", competitionId: "18271" },
];
```

The first entry in the array is always the current/default season. When adding a new season, add it at the TOP of the array.

### 5.3 The Automatic Season Detection System

The app automatically detects when Swehockey creates a new season on their site. The mechanism:

1. Every time the main dashboard (`/`) loads, a `useEffect` fires `runSeasonScan`
2. The scan is throttled to run at most once every 6 hours (database-controlled)
3. The scan fetches the current season's standings page and reads the season dropdown
4. Any season label (e.g. `2026-27`) found in the dropdown that isn't already in `seasons.config.ts` or the Supabase `season_overrides` table is stored as `"pending"` in `season_detections`
5. A blue banner appears at the top of the dashboard showing the pending season
6. The producer reviews the competitionId (editable field), verifies it on swehockey.se, and presses "Lägg till"
7. Confirming writes to the `season_overrides` table in Supabase – NOT to `seasons.config.ts`
8. The `getMergedSeasons()` function merges `seasons.config.ts` with `season_overrides`, newest first
9. The new season immediately becomes the default throughout the entire app

**Important:** You do NOT need to edit `seasons.config.ts` or make a GitHub commit when a new season arrives. The banner handles the entire transition through the app's own UI. `seasons.config.ts` is a fallback for environments where the database isn't available.

---

## 6. The Admin vMix Page (`/admin/vmix`) – Every Card Explained

Accessible via the vMix button in the navigation (visible when logged in). Requires authentication.

### 6.1 Page Header

Shows the page title and a status badge:
- **LIVE** (filled blue) – An active publication exists. The JSON endpoints are serving real data to vMix right now.
- **Ingen aktiv publicering** (outlined) – Nothing is published. Endpoints return empty/error responses.

This badge is your pre-broadcast sanity check.

### 6.2 Card: vMix-inställningar (Settings)

Three configurable fields stored in the `vmix_settings` Supabase table. These affect the JSON output served to vMix.

**Asset Base URL** (key: `asset_base_url`)
The IP address and port of the vMix computer's local web server. Default was `http://192.168.1.235:8765` (the test computer). **Must be updated before first real broadcast** to match the actual broadcast computer's IP. Used to construct every image URL in the JSON output – plates, logos, backgrounds. If this is wrong, player names appear but all images are missing.

**Club ID** (key: `club_id`)
Grästorps IK's identifier in the Swehockey system. Currently `570`. The backup endpoint validates that incoming vMix requests include this matching ClubId. If Swehockey ever changes the club ID, update this field.

**Lineup Version** (key: `lineup_version`)
The path parameter in the API URL (the `0` in `/api/lineup/0`). Was `0` throughout the 2024-25 season. If Swehockey changes their template format version, update this to match.

All three fields save simultaneously with "Spara inställningar". Save button disabled if any field is empty.

### 6.3 Card: vMix-endpoints

Shows the two active backup endpoints with copy and open buttons:

**standings.json**
```
https://[app-domain]/api/public/vmix/standings
```
Returns the full HockeyEttan Södra league table. All 20 teams with position, games played, goal difference, and points. Feeds the standings graphic in GT Designer.

**lineup.json**
```
https://[app-domain]/api/public/vmix/lineup/0?ClubId=570
```
Returns both teams' lineup data combined in one flat JSON object, wrapped in an array. Exact same structure as the real Swehockey API. This is the primary backup endpoint. The URL structure deliberately mirrors the real API so switching only requires changing the domain.

Two previously existing endpoints (`home-lineup.json` and `away-lineup.json`) were removed during cleanup. They used an older nested format incompatible with GT Designer's data binding.

### 6.4 Card: Testa endpoints

A live endpoint tester. For each endpoint shows: status badge (idle/loading/OK/error), response time in ms, HTTP status code, timestamp of last test, and a scrollable preview of the actual JSON body.

**Testa alla button** – tests both endpoints simultaneously on demand.

**Auto 10s button** – when enabled, retests both endpoints every 10 seconds automatically. Turn this on ~30 minutes before puck drop to continuously monitor that the backup is working.

**Pre-broadcast verification workflow:** Press "Testa alla" after publishing, verify both endpoints return green OK, check that the lineup.json preview shows your actual player data. If lineup.json returns a green OK with correct player names visible in the preview, vMix can switch to the backup and receive correct data instantly.

### 6.5 Card: Datakälla

Handles which game's data is loaded into the lineup editors. Has two modes:

**Automatic mode:** When the page opens, the app scrapes the swehockey.se schedule to check for Grästorp IK home games today. Status badges:
- **AUTO (green)** – Home game found, rosters pre-filled, ready to edit
- **AUTO (outlined)** – No home game found (away game, rest day, off-season)
- **LIVE** – An active publication exists; form shows that publication's data
- **MANUELL (amber)** – Manual override is active

**Manual override:** Opens a panel with date picker, home team selector, away team selector. Use this for away games, testing with past matches, or any situation where auto-detection doesn't find the right matchup. Press "Använd denna match" to load those teams' rosters.

**Important note displayed when LIVE:** "Obs: en LIVE-publicering är aktiv. Ändringar här påverkar inte JSON-feeden förrän du klickar Publicera till vMix." Editing the form does NOT update what vMix receives until you press publish.

### 6.6 Card: Hemmalag – lineup

The home team lineup editor. Structure mirrors the GT Designer graphic exactly.

**Header row contains:**
- **Lag dropdown** – team selector (synchronized with away team to prevent duplicates). Counter shows "X MV · Y utespelare" filled slot count.
- **Logotypkod field** – short code for logo filenames (e.g. `GRÄ` for Grästorp). Auto-uppercases. Must match logo filenames on the vMix computer. NOT filled by the roster prefill – enter manually.
- **Hämta från roster button** – fetches general squad from swehockey.se. Places players in correct position slots using swehockey.se's own position codes (GK, LD, RD, LW, CE, RW). This is a starting point only – the producer must then remove scratches/injuries and reorder within columns to match actual line assignments.

**MÅLVAKTER section:** Two side-by-side slots (MV1, MV2). Each slot = number input + name input.

**BACKPAR section:** 5 rows × 3 columns grid. Column headers: "LD (Vänster)", "RD (Höger)", "XD (Extra back)". XD column is the third column visible in the GT Designer graphic – used for overflow defenders without a pair partner. Typically left empty.

**FORWARDS section:** 5 rows × 3 columns grid. Column headers: "LW (Vänster)", "C (Center)", "RW (Höger)". Row 5 labeled "(Extra)" – for players who don't have complete line partners. Any slot in any column can be used for extras (teams decide when they submit their game lineup to Swehockey).

All 15 slots per section are always visible. No add/delete row buttons. Leave unused slots empty – GT Designer makes them completely invisible automatically.

### 6.7 Card: Bortalag – lineup

Identical structure to the home team card. Team dropdown shows all teams except the selected home team. "Hämta från roster" button disabled until an away team is selected.

### 6.8 Sticky Bottom Bar

Fixed to bottom of screen, always visible regardless of scroll position.

**Publicera till vMix (primary button)** – Saves all form data to the `vmix_publications` Supabase table as the active publication. All endpoints immediately serve this data. Disabled if no away team selected.

**Avpublicera (outlined button)** – Clears the active publication. Endpoints return error responses. Disabled if nothing is published.

**Published timestamp** – shows when current publication was last saved (e.g. "Publicerad 2025-06-30 18:42:15").

---

## 7. The Data Flow: How Lineup Data Reaches vMix

### Step-by-step for a home game day:

1. **Page opens** → `getTodaysMatchup` scrapes the schedule page for today's Grästorp home game
2. **Match found** → `useEffect` automatically calls `applyMatchup`
3. **Roster prefill** → `scrapeTeamRoster` fetches both teams' general squads from swehockey.se's `TeamRoster/{competitionId}` page simultaneously
4. **Pool built and dropdowns populated → scrapeTeamRoster returns a sorted RosterPlayer[] array. Players are sorted by position group (GK first, then LD, RD, LW, CE, RW, unknowns last) then by jersey number within each group. This pool populates the dropdown on every slot in the form. All slots remain empty.
5. **Producer fills slots via dropdowns → Opens each slot's dropdown, picks the correct player from the grouped list. Enters Logotypkod for both teams. Players not in the pool are typed directly into the text inputs.
6. **"Publicera till vMix"** → All slot data saved to `vmix_publications` in Supabase as active publication
7. **vMix polls every 15 seconds** → `GET /api/public/vmix/lineup/0?ClubId=570`
8. **Endpoint validates ClubId** → Checks against stored `club_id` in `vmix_settings`
9. **Endpoint queries database** → Reads active publication from `vmix_publications`
10. **Endpoint reads asset base URL** → From `vmix_settings` table
11. **Builds flat JSON** → Constructs all 64 named slot fields (32 per team × 2 teams) plus team names, logos, and shared resources
12. **Returns JSON array** → `[{...full flat object...}]`
13. **GT Designer receives JSON** → Maps each named field to text boxes and image elements in the graphic template
14. **Graphic appears on broadcast**

### Critical limitation: Roster vs Game Lineup

The roster scraper uses `TeamRoster/{competitionId}` which lists every player registered for the entire season (~25-30 players per team). It does NOT know:
- Who is injured or suspended tonight
- Who was scratched from the lineup
- Which specific line each player is assigned to
- Game-specific lineup changes

The actual game lineup (20 dressed players with exact line assignments) is submitted by teams to Swehockey before puck drop and only appears on the `Game/Events/{gameId}` page – typically not until after the game has started. This is too late for pre-game graphics preparation.

This is why the admin form with manual editing exists. The roster prefill gives a structured starting point; the producer applies their knowledge of tonight's actual lineup.

---

## 8. The Standings Endpoint

**URL:** `GET /api/public/vmix/standings`

Returns the full HockeyEttan Södra league table from the active publication in Supabase. The standings are scraped from swehockey.se when the producer presses "Publicera till vMix" (the standings scrape happens as part of the publish action, not separately).

Response structure when published:
```json
{
  "published": true,
  "updatedAt": "2025-06-30T14:22:00Z",
  "standings": [
    { "position": 1, "team": "Tingsryds AIF", "gamesPlayed": 36, "goalDiff": 62, "points": 87 },
    { "position": 2, "team": "HC Vita Hästen", "gamesPlayed": 36, "goalDiff": 63, "points": 84 },
    ...
  ]
}
```

The GT Designer standings graphic binds each row's fields individually by position index.

---

## 9. Scraping URLs Used by the App

All scraping starts from `https://stats.swehockey.se`. The `{competitionId}` in each URL is currently `18271` for the 2025-26 season.

| Purpose | URL |
|---|---|
| Schedule (game results, today's matchup detection) | `/ScheduleAndResults/Schedule/{competitionId}` |
| Standings (league table for vMix graphic) | `/ScheduleAndResults/Standings/{competitionId}` |
| Team Roster (player prefill for lineup editor) | `/Teams/Info/TeamRoster/{competitionId}` |
| Players by Team / Scoring (briefing app – top scorers, goalies, discipline) | `/Teams/Info/PlayersByTeam/{competitionId}` |
| Team Statistics (briefing app – scoring and goalkeeping) | `/Teams/Statistics/ScoringAndGoalkeeping/{competitionId}` |
| Special Teams (briefing app – PP% and PK%) | `/Teams/Statistics/PowerplayAndPenaltyKilling/{competitionId}` |
| Individual game events (hot players, last meeting) | `/Game/Events/{gameId}` |
| Season detection | `/ScheduleAndResults/Standings/18271` (current season, has dropdown of all seasons) |

Two scraping methods exist in the codebase: direct HTML fetch with regex parsing (used for vMix-related data), and Firecrawl (external paid service used for some briefing data – converts HTML to Markdown before returning).

---

## 10. Code Changes – Final Implemented State

All work on the vMix backup system is complete. The following describes what was built, in the order it was implemented. Everything listed here is confirmed present in the codebase as of July 2026.

---

### Architecture: The Slot-Based Lineup System

The core of the vMix backup system is a slot-based data model where every player position in the GT Designer graphic has an explicitly named slot. This was built as a coordinated change across multiple files.

**Types defined in `src/lib/vmix.functions.ts`:**
- `SlotPlayer` – a single player `{ name: string, number: number | string }` or `null` if the slot is empty
- `SlotKey` – a union type of all 32 slot names per team (`GK1`, `GK2`, `LD1`–`LD5`, `RD1`–`RD5`, `XD1`–`XD5`, `LW1`–`LW5`, `C1`–`C5`, `RW1`–`RW5`)
- `VmixLineupSlots` – the full lineup object: `{ team, teamCode }` plus one `SlotPlayer` field per `SlotKey`
- `RosterPlayer` – `{ name, number, position }` used for the player dropdown pool
- `SLOT_KEYS` – exported constant array of all 32 slot names, used for iteration

**Server functions in `src/lib/vmix.functions.ts`:**
- `fetchTeamRoster` – authenticated server function that scrapes swehockey.se and returns `RosterPlayer[]` (the full roster pool, sorted by position group then jersey number). Does NOT fill any slots.
- `publishVmix` – saves a complete publication (both teams' slots + standings) to `vmix_publications` in Supabase and marks it as the active publication
- `unpublishVmix` – clears the active publication
- `getActivePublication` – public (no auth) server function that reads the current active publication from Supabase
- `getVmixSettings` / `saveVmixSettings` – read and write the three vMix settings from the `vmix_settings` table

**Scraping in `src/lib/vmix.server.ts`:**
- `scrapeTeamRoster(teamName, season)` – fetches the `TeamRoster/{competitionId}` page from swehockey.se, parses all player rows, detects position codes by scanning all cells with a regex (`GK|MV|LD|RD|LW|CE|RW`) rather than relying on a fixed column index, formats names as `LASTNAME, FIRSTNAME` uppercase, sorts the result by position group then jersey number, and returns a flat `RosterPlayer[]` array. Does not perform any slot assignment.

---

### The vMix Endpoints

**`src/routes/api/public/vmix/lineup.$version.ts`** – The primary backup endpoint. Fully public (no auth). Accepts `?ClubId=` query parameter, validates it against `club_id` in `vmix_settings`, reads the active publication from Supabase, reads `asset_base_url` from `vmix_settings`, and builds the full flat JSON payload in the exact same structure as the real Swehockey API. Returns a JSON array `[{...}]` containing one flat object with all 64 named slot fields (32 per team) plus team names, logos, and shared resource URLs. When nothing is published returns `["Ingen aktiv publicering – publicera via admin-sidan"]` mirroring the real API's error format.

**`src/routes/api/public/vmix/standings.ts`** – Public endpoint. Returns the full HockeyEttan Södra league table from the active publication as structured JSON. The standings are scraped from swehockey.se at publish time, not on demand.

**`src/routes/api/public/vmix/current.ts`** – Public endpoint. Returns game metadata (home team, away team, date, venue, notes) from the active publication. Not currently shown in the admin UI endpoints list or tester, but the file is kept for potential future use.

**Deleted files:** `home-lineup.ts` and `away-lineup.ts` were deleted from this directory. They used an old nested format incompatible with GT Designer's data binding and are fully superseded by `lineup.$version.ts`.

---

### The Admin Page (`src/routes/_authenticated/admin.vmix.tsx`)

**Removed:** The `Matchinställningar` card (date, venue, home/away team dropdowns, notes textarea) was removed as redundant. Team selection is handled by the lineup editor cards. Date is set by Datakälla. Venue and notes are always saved as `null`. The state variables `venue` and `notes` remain in the file as silent no-ops (always empty strings, always publishing as `null`) to avoid broken references.

**vMix-inställningar card:** Three configurable fields saved to the `vmix_settings` Supabase table: `asset_base_url` (the vMix computer's local web server IP and port), `club_id` (Grästorp IK's ClubId in the Swehockey system, currently `570`), and `lineup_version` (the path parameter in the API URL, currently `0`).

**vMix-endpoints card:** Shows two endpoints only – `standings.json` and `lineup.json`. The `lineup.json` URL is constructed from the stored settings values and deliberately mirrors the real API URL structure so switching vMix between primary and backup only requires changing the domain name.

**Testa endpoints card:** Live endpoint tester for both endpoints. Shows status (idle / loading / OK / error), response time in ms, HTTP status code, last tested timestamp, and a scrollable preview of the actual JSON body. Has "Testa alla" for on-demand testing and "Auto 10s" for continuous monitoring during broadcast preparation.

**Datakälla card:** Handles matchup detection. Auto-detects Grästorp IK home games from the swehockey.se schedule. When a home game is found, it fetches the player pool for both teams automatically and populates the dropdowns. Supports manual override for away games, past matches, or testing. When an active publication already exists, the form hydrates from that publication instead.

**SlotLineupEditor component:** The lineup editor for each team. Contains:
- Team name dropdown (synchronized with the other team to prevent duplicates)
- Logotypkod text field (the short code for logo filenames, e.g. `GRÄ` for Grästorp – must be entered manually, not fetched from roster)
- "Ladda spelarlistan" button – fetches the full roster from swehockey.se and stores it as a pool. Does NOT fill any slots. All slots remain empty after pressing this button.
- A filled slot counter in the card header ("X MV · Y utespelare") that updates live as the producer fills slots
- Three sections: MÅLVAKTER (2 slots side by side), BACKPAR (5 rows × 3 columns: LD, RD, XD), FORWARDS (5 rows × 3 columns: LW, C, RW)

**SlotInputs component:** Each individual slot in the grid. When a roster pool is loaded, shows a native `<select>` dropdown above the text inputs. The dropdown lists all players from the pool grouped into Målvakter, Backar, and Forwards optgroups with their position code shown. Selecting a player from the dropdown fills both the number and name text inputs automatically. Text inputs remain editable for manual entry of players not in the pool (call-ups, loan players from other clubs, etc.). When no pool is loaded (before pressing "Ladda spelarlistan"), only the text inputs are shown.

**Workflow:** All slots start empty. The producer presses "Ladda spelarlistan" to populate the dropdowns. They then open each slot's dropdown and pick the correct player from the list. Every selection is a deliberate conscious choice matching the actual game lineup sheet received from the teams before puck drop. This design was chosen over auto-filling because auto-fill created a messy starting state that required cleanup rather than clean deliberate selection.

---

### The Supabase Tables

**`vmix_settings`** – Key-value table with three rows: `asset_base_url`, `club_id`, `lineup_version`. Public read (SELECT), authenticated write. Defaults: `http://192.168.1.235:8765`, `570`, `0`.

**`vmix_publications`** – Stores active and historical publications. Key columns: `home_slots JSONB`, `away_slots JSONB`, `home_team_code TEXT`, `away_team_code TEXT`, `home_team TEXT`, `away_team TEXT`, `game_date TEXT`, `is_active BOOLEAN`, `published_at TIMESTAMPTZ`. Only one row has `is_active = true` at any time. Publishing deactivates all existing rows before inserting the new one.

---

### Known Minor Issues (Cosmetic Only, No Functional Impact)

**Dead code in `vmix.server.ts`:** The old position helper functions (`isGoalie`, `isLeftDefense`, `isRightDefense`, `isGenericDefense`, `isLeftWing`, `isCenter`, `isRightWing`) were not removed when the slot auto-fill logic was deleted. They are never called and have no effect, but they add noise to the file. Can be safely deleted in a future cleanup commit.

**Outdated comment in `vmix.server.ts`:** The top-of-file comment still says "packs it into the slot-based VmixLineupSlots shape the vMix GT Designer graphic expects." This is no longer accurate since the function now only returns a `RosterPlayer[]` pool. Can be updated in the same cleanup commit.



---

## 11. File Structure – Key Files for the vMix System

```
src/
├── lib/
│   ├── seasons.config.ts        ← competitionId per season, add new seasons here
│   ├── seasons.server.ts        ← season detection logic, scan + confirm/dismiss
│   ├── vmix.functions.ts        ← VmixLineupSlots type, SlotPlayer type, publishVmix,
│   │                               getActivePublication, getVmixSettings, SLOT_KEYS
│   ├── vmix.server.ts           ← scrapeTeamRoster (roster prefill logic)
│   └── stats.server.ts          ← Supabase client, fetchFullStandings, other briefing scrapers
│
├── routes/
│   ├── index.tsx                ← Main dashboard, PendingSeasonsBanner, briefing UI
│   ├── _authenticated/
│   │   ├── admin.vmix.tsx       ← The entire admin vMix page
│   │   ├── admin.health.tsx     ← Scraper health monitoring
│   │   └── admin.logos.tsx      ← Team logo management
│   └── api/
│       └── public/
│           └── vmix/
│               ├── lineup.$version.ts  ← Combined backup endpoint (primary)
│               ├── standings.ts        ← League table endpoint
│               └── current.ts          ← Game metadata (kept but not shown in UI)
│
└── components/
    └── dashboard/
        └── pending-seasons-banner.tsx  ← Season detection UI banner
```

---

## 12. Supabase Tables Relevant to the vMix System

| Table | Purpose |
|---|---|
| `vmix_publications` | Stores active and historical publications. Columns: `home_slots JSONB`, `away_slots JSONB`, `home_team_code TEXT`, `away_team_code TEXT`, `home_team TEXT`, `away_team TEXT`, `game_date TEXT`, `is_active BOOLEAN`, `published_at TIMESTAMPTZ` |
| `vmix_settings` | Key-value store for vMix configuration. Keys: `asset_base_url`, `club_id`, `lineup_version` |
| `season_detections` | Pending/confirmed/dismissed season detections from the auto-scan |
| `season_overrides` | Confirmed new seasons added via the banner UI |
| `season_check_meta` | Throttle state for season scan (stores last check timestamp and status) |

---

## 13. Pre-Broadcast Workflow (Game Day Checklist)

1. **Open `/admin/vmix`** – Check LIVE badge in top right
2. **Datakälla card** – Verify correct matchup was auto-detected (or use manual override for away games)
3. **vMix-inställningar card** – Verify Asset Base URL matches today's broadcast computer IP
4. **Hemmalag card – Enter Logotypkod (e.g. GRÄ), press "Ladda spelarlistan" to fetch the player pool and populate the dropdowns, then:

Open each slot's dropdown and select the correct player from the grouped list
For players not in the roster (call-ups, loan players), type their number and name directly into the text inputs below the dropdown
Verify the "X MV · Y utespelare" counter at the top of the card to confirm expected numbers of filled slots
The card header counter is your running tally of completeness before publishing
5. **Bortalag card** – Same process as home team, enter opponent's Logotypkod
6. **Press "Publicera till vMix"** – Wait for "Publicerat till vMix" toast
7. **Testa endpoints card** – Press "Testa alla", verify both show green OK
8. **Check lineup.json preview** – Confirm you can see your actual player names in the JSON body
9. **In vMix GT Designer** – If primary API is failing, change the domain in the data source URL from `vmix-new.hockeyettan.se` to your app domain. Everything else in the URL stays the same.
10. **Enable Auto 10s** in the tester to monitor throughout the broadcast

---

## 14. Key Configuration Values Quick Reference

| Item | Value | Where to Change |
|---|---|---|
| Current competitionId | `18271` (HockeyEttan Södra 2025-26) | `src/lib/seasons.config.ts` OR via season detection banner |
| Grästorp IK ClubId | `570` | Admin page → vMix-inställningar → Club ID field |
| Lineup version | `0` | Admin page → vMix-inställningar → Lineup Version field |
| vMix asset base URL | `http://192.168.1.235:8765` (test computer) | Admin page → vMix-inställningar → Asset Base URL field |
| Real API domain | `vmix-new.hockeyettan.se` | N/A (external, not configurable) |
| Backup API path | `/api/public/vmix/lineup/0?ClubId=570` | N/A (mirrors real API, changes with settings) |
| Default team | `Grästorps IK` | Hardcoded in `admin.vmix.tsx` as `DEFAULT_TEAM` constant |

---

## 15. Things to Watch For / Known Gotchas

**The Lovable dev preview (localhost:8080) fails with Supabase errors**
The dev preview doesn't have access to the `SUPABASE_SERVICE_ROLE_KEY` secret – this is intentional for security. Always test the actual deployed app at the `lovable.app` domain, not the Lovable preview panel.

**Asset Base URL must be updated per broadcast location**
If the broadcast computer's IP address changes (different venue, router replacement, DHCP lease change), the vMix graphics will lose all images but still show player names. Update Asset Base URL in the settings card immediately.

**Roster prefill is a starting point, not a final answer**
The general squad page lists all registered players for the season. It does not know about injuries, suspensions, game-night scratches, or line assignments. Always verify and edit before publishing.

**Team logo codes must match vMix computer filenames exactly**
The `Logotypkod` field (e.g. `GRÄ`) must exactly match the prefix of the logo files stored on the vMix computer's web server (`GRÄ_small.png`, `GRÄ_large.png`). Case-sensitive on some systems. If the code is wrong, the team logo will be missing from the graphic.

**Confirm before dismissing season detections**
If the season detection banner appears, verify the competitionId by opening `https://stats.swehockey.se/ScheduleAndResults/Standings/{competitionId}` to confirm it shows HockeyEttan Södra. The auto-detected ID is usually correct but worth verifying. Once dismissed, a detection won't reappear for that season label.

**Never force-push or rebase pushed commits**
The Lovable ↔ GitHub bidirectional sync will break. All changes must be forward-only commits.

---

*End of reference document. Last updated: July 2026.*
