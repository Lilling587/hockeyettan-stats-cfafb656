# HockeyEttan Stats – Broadcast Reference Document
*Last updated: July 2026*

---

## 1. What Is This App and Why Does It Exist?

**HockeyEttan Stats** is a broadcast support tool built for HockeyEttan Södra coverage
at Grästorps IK. It serves three purposes:

**Purpose 1: Match Briefing**
The main dashboard scrapes stats.swehockey.se and produces a comprehensive pre-game
briefing for producers and commentators: head-to-head history, current form, top
scorers, goalie stats, special teams percentages, shot stats, faceoff data, and more.
Features include auto-refresh (every 30 minutes when enabled) and a tablet-optimized
mode for the commentator touchscreen.

**Purpose 2: vMix Backup Data Source**
The primary data source for vMix broadcast graphics is the official Swehockey vMix API
at https://vmix-new.hockeyettan.se/api/. This API experienced reliability issues during
peak load (Swehockey has cut off Hockeyettan during high-traffic periods to protect
SHL/Allsvenskan). HockeyEttan Stats acts as a manual backup — the producer publishes
lineup and standings data through the admin UI before the game. If the real API fails
during broadcast, vMix is switched to the backup endpoint by changing only the domain.

**Purpose 3: League Stats and Comparison**
The Compare page shows league-wide statistics: standings, Poängliga, Målvaktsliga,
Utvisningsliga, Gjorda/insläppta mål, and Hetaste lag. The Players page shows
individual player statistics for the full league.

---

## 2. Technology Stack

| Component | Technology |
|---|---|
| Framework | TanStack Start (TanStack Router + TanStack Query) + React 19 |
| Database | Supabase (PostgreSQL via Lovable Cloud) |
| Asset Storage | Supabase Storage (public vmix-assets bucket) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Deployment | Cloudflare Workers (via Lovable) |
| Repository | github.com/Lilling587/hockeyettan-stats |
| Lovable project ID | b5d9d92f-3d6c-4d04-99c2-25be99cec0a2 |
| Production URL | https://hockeyettan-stats.spdproduktion.se |
| Email scheduling | pg_cron (via Lovable Supabase) with Resend |
| Scraping | Firecrawl (JS-rendered pages) + direct fetch fallback |

---

## 3. Code Change Workflow

Primary editing environment: **github.dev** — press `.` on any GitHub repo page.
This opens a full VS Code editor in the browser with Ctrl+F search and find/replace.
Commit directly to main. Lovable picks up changes automatically via GitHub App webhook.

Lovable credits reserved for: multi-file coordinated changes, or architectural work
that spans more files than is practical to edit manually.

Claude Code (desktop app) used for: debugging across multiple files, understanding
data flow, refactoring large files.

Change format: All code instructions use exact FIND / REPLACE WITH blocks with
search text. Commit message always goes at the END of each file's changes.
Blocks over ~50 lines are provided as downloadable files.

Permanently banned: Force-pushing, rebasing, amending pushed commits, squashing
pushed commits. These break the bidirectional Lovable↔GitHub sync.

Always test on production URL (hockeyettan-stats.spdproduktion.se), not Lovable
preview. Lovable in-app preview is often stale — open in new browser tab instead.

CLAUDE.md in repo root: Claude Code reads this at the start of every session.
Contains stack info, git rules, key constants, scraping patterns, and what not to do.

---

## 4. Authentication

There are two separate login flows using the same /auth page:

### 4.1 Regular User Login / Sign-Up
- Entry: "Logga in" button in homepage header
- Sign-up available (email + password)
- After login: sees "Notiser" and "Logga ut" only
- Cannot access admin pages
- Purpose: subscribe to pregame/postgame email notifications

### 4.2 Admin Login (No Sign-Up)
- Entry: "Admin" link in homepage header -> /auth?next=/admin/vmix
- Sign-up hidden — admins must be added by existing admin via /admin/users
- After login: sees full "Admin" dropdown with all admin links
- Purpose: manage lineup data, publish to vMix, monitor system health

The admin role is assigned in the database. The login form is identical for both
flows — sign-up is hidden for the admin flow and the page title changes accordingly.

---

## 5. The vMix Backup System

### 5.1 Real Swehockey API

Lineup: https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
Standings: https://vmix-new.hockeyettan.se/api/tabel/

Both return a JSON array containing one flat object with named keys.

### 5.2 Backup Endpoints

All public endpoints are rate-limited to 120 requests/minute per IP.
Internal server-to-server requests (IP = "unknown") are always exempt.

| Endpoint | Backup URL |
|---|---|
| Lineup | /api/public/vmix/lineup/0?ClubId=570 |
| Standings | /api/public/vmix/standings |
| Title card | /api/public/vmix/titlecard |
| Today's games | /api/public/vmix/todays-games |
| Player stats | /api/public/vmix/player?PlayerName=LASTNAME,%20FIRSTNAME |

Switching from primary to backup requires only changing the domain in vMix.

### 5.3 Active Publication Cache

30-second in-memory cache in getActivePublication. Invalidated immediately on
publish/unpublish/restore/refresh. HTTP Cache-Control: max-age=30,
stale-while-revalidate=60 on lineup, standings, titlecard. Today's games uses
max-age=60, stale-while-revalidate=120. Player uses max-age=300,
stale-while-revalidate=600.

### 5.4 Lineup JSON Structure

Key naming: {team}_{position}{slot}_{field}.{type}
Examples: H_GK1_name.Text, A_LW3_number.Text, H_RD2_plate.Source

Each team has 32 slots: GK1-2, LD1-5, RD1-5, XD1-5, LW1-5, C1-5, RW1-5.
Empty slots have _plate.Source = "" making them invisible in GT Designer.
The $version URL parameter is accepted but ignored — use 0.

### 5.5 Standings JSON Structure

Zero-padded 01-20 per team:
Pos{NN}.Text, Team{NN}t.Text, M{NN}.Text, D{NN}.Text, P{NN}.Text,
Team{NN}.Source, Frame{NN}.Source

Active separator lines (not zero-padded):
SolidLine6 = qualification cutoff
DottedLine10 = playoff cutoff
DottedLine18 = relegation cutoff

Standings are static during broadcast but can be refreshed via Uppdatera tabell.

### 5.6 Title Card JSON Structure

HomeTeam.Text, AwayTeam.Text, HomeTeamShort.Text, AwayTeamShort.Text,
GameDate.Text (e.g. "15 OKT"), Venue.Text, League.Text ("HOCKEYETTAN SODRA")

### 5.7 Today's Games JSON Structure

Scrapes /ScheduleAndResults/Live/{competitionId} on swehockey.
GamesCount.Text, Game01Home.Text, Game01Away.Text, Game01Score.Text,
Game01Status.Text, Game02Home.Text... (zero-padded)
Returns empty object on off-season days.

### 5.8 Player Stats JSON Structure

URL: /api/public/vmix/player?PlayerName=SVENSSON,%20ERIK
Returns: Name.Text, Team.Text, Position.Text, Goals.Text, Assists.Text,
Points.Text, GamesPlayed.Text
Returns 404 if player not found. Cached 5 minutes server-side.

### 5.9 Switching in vMix

Real:   https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
Backup: https://hockeyettan-stats.spdproduktion.se/api/public/vmix/lineup/0?ClubId=570

Only the domain changes. Expected use: 1–3 times per season when Swehockey API
is slow or cut off.

---

## 6. Asset Storage (Supabase Storage)

Only the vmix-assets bucket is used. Old buckets (logos, team-logos) were deleted.

Bucket structure:
  vmix-assets/logos/     <- Team logos (small + large per team)
  vmix-assets/resources/ <- lineup-PLATE.png, transparent.png, lineupBG.png,
                            lineup-DIVISION.png

The large logo (*_large.png) serves BOTH vMix graphics AND the stats briefing
dashboard. Uploading in admin/assets under Logotyper (vMix) -> Large updates both.

ASCII-safe filenames: GRA (for GRÄ), MOR (for MÖR), VAS (for VÄS), MJO (for MJÖ).

### 6.1 Briefing Logo Cache

team_logos database table caches logo URLs with 7-day localStorage TTL.
URLs point to Supabase Storage instead of hockeyettan.se.
Managed via "Cachelagda logotyper (statistiksida)" card in /admin/assets.
"Hämta om" button uses supabaseAdmin (service role) to bypass RLS.

---

## 7. Team Logo Codes System

Maps team names to short codes (e.g. "Grästorps IK" -> "GRÄ").
Stored in team_logo_codes table (team_name, logo_code, source, updated_at).
Codes sourced from team-short-names.ts (generated by scripts/update-team-short-names.mjs).
fetchTeamCodeMap() now uses shortTeamName() + KNOWN_TEAM_NAMES directly — no network fetch.
Manual overrides preserved during sync.
Auto-fills Logotypkod field in admin page when team is selected.
Codes enriched into standings rows at publish time.

2026-27 season team changes:
  IN:  Boro/Vetlanda HC (BOR), IF Troja-Ljungby (TRO)
  OUT: Visby/Roma HK (VIS, promoted to Allsvenskan)

---

## 8. The Admin vMix Page (/admin/vmix)

Card-based layout. Always visible: Förberedelsekontroll, Datakälla, season
selector, two lineup editors, sticky publish bar. CardErrorBoundary on each major card.

### 8.1 Förberedelsekontroll (Readiness Card)

Shows go/no-go for: away team selected, active publication, hemma-lineup completeness,
borta-lineup completeness, logo codes synced, official Swehockey API status (60s poll).
Card border: green (all OK) / amber (warnings) / red (errors).
Broadcast countdown timer: enter puck drop time HH:MM for live T-minus display.

### 8.2 Draft Auto-Save

Form state saved to localStorage every 5 seconds (skips if unchanged). Restore banner
on next visit. Draft cleared on successful publish.

### 8.3 Datakälla Card

Status badges: AUTO green (home game found), AUTO outline (no game today), LIVE
(publication hydrated), MANUELL amber (manual override).

"Skanna efter ny säsong" button in card header — triggers season scan without logout.
New season detected → PendingSeasonsBanner appears above the card to confirm/dismiss.

Season auto-detection: app scans swehockey for new competition IDs. On admin login,
scan runs automatically. Confirmed seasons stored in season_overrides table (Supabase).
seasons.config.ts is the baseline; database overrides take precedence.

### 8.4 Season Selector

Dropdown above Datakälla. Shows actual season label (e.g. 2025-26). Selects
competition ID for roster scraping.

### 8.5 Logotypkoder Card (collapsible)

Inline editing of team logo codes. "Synka från Swehockey" button.

### 8.6 vMix-endpoints Card (collapsible)

COMBINED reference + tester card. Each endpoint shows URL + copy + open + status badge
+ response time + refresh button in one row. "Auto 60s" and "Testa alla" always visible
in header even when collapsed. Alert fires when endpoint transitions from OK to error.
Endpoints: standings, lineup, titlecard, todays-games.

### 8.7 Publication History Card (collapsible)

Last 5 publications. Active = green LIVE badge. Others have "Använd" button to load
that publication's data into the form for re-publishing.

### 8.8 Granskningslogg Audit Log (collapsible)

Last 20 audit events. Written by logAuditEvent (non-blocking).

### 8.9 Lineup Editor Cards

Auto mode: fetches tonight's published lineup from /Game/LineUps/{gameId} on swehockey.
Pre-fills slots using position data from roster (goalies→GK, defenders→LD/RD, forwards→LW/C/RW).
If lineup not yet published (~30-60 min before puck drop), slots start empty with toast message.

Manual mode: always starts with empty slots — producer fills deliberately.

Both modes: loads full roster pool into dropdowns for each slot. Producer reviews
and adjusts positions after auto-fill.

Position "G" excluded from dropdown (misidentified Goals column from stats page).

### 8.10 Lineup-mallar Card (collapsible)

Save/restore presets. Filtered to show presets matching current teams.

### 8.11 Försäsong Card

Fetch roster for any team via any competition ID (for pre-season/friendly matches
where teams may not be in the regular season roster).

### 8.12 Sticky Bottom Bar

Publicera till vMix -> confirmation dialog -> publish + fetch standings
Avpublicera -> red confirmation dialog
Uppdatera tabell -> re-scrape standings only
Exportera JSON -> download current lineup JSON
Avsluta sändning -> confirmation -> unpublish + clear draft + reset form
Below: timestamp + diff summary (+ tillagd, - borttagen, ↔ bytt)

### 8.13 Server-Side Publish Validation

Blocks publish if: home lineup empty, logo code missing, standings scrape <8 teams.

---

## 9. Commentator Dashboard

URL anchors for Stream Deck navigation (see public/briefing-anchors.json):
#teams, #h2h, #season-record, #form, #venue, #hot, #home-away-split, #shots,
#periods, #scorers, #goalies, #special, #discipline, #faceoffs, #lineup,
#streaks, #rest, #probability

Features:
- Sticky top navigation header (stays visible while scrolling)
- Scroll memory: returns to same position when navigating away and back
- Auto-refresh every 30 minutes (toggle button)
- Tablet mode: larger text (text-xl), more spacing (space-y-10), green toggle button
- Compact match banner after loading (collapses team selector)
- Keyboard shortcuts: 1=Briefing, 2=Recap, L=Load, R=Refresh, P=Print, ?=Help
- Export: "Kopiera som text" (TV-mall, goalies sorted by save%) and "Kopiera som markdown"

Hardware: Lenovo ThinkCentre M720Q + 15.6" portable USB-C touchscreen.

### 9.1 Briefing Cards (in visual order)

**TeamHeader** (Lagöversikt) — anchor: #teams
League position, points, and GP for each team in the same stats row.
All three labels (Placering, Poäng, GP) centered under their numbers.

**H2HCard** (Inbördes möten) — anchor: #h2h
Head-to-head history between the two teams this season. Shows "Inga möten ännu" early season.

**SeasonRecordCard** (Vunna/Förlorade & mål) — anchor: #season-record
Win/loss record and goals for/against for the season.

**FormCard** (Senaste 5) — anchor: #form
Last 5 played games per team. Uses Firecrawl markdown of schedule page (full season).
Note: direct HTML fetch of schedule is partially JS-rendered and misses some rounds.

**VenueStreakCard** (Form hemma/borta) — anchor: #venue
Last 5 home games and last 5 away games per team. Single-row layout: streak badge
(W2/L3 etc.) prominently displayed, followed by individual result badges (W/OT/L).

**HottestPlayerCard** (Hetaste spelare) — anchor: #hot
Player with most points in last 5 games per team. Name displayed as Firstname Lastname.

**HomeAwaySplitCard** (Tagna poäng på hemma/borta plan) — anchor: #home-away-split
Points earned at home vs away this season.

**ShotCard** (Skott) — anchor: #shots
4 stats per team in a table layout:
- SF/match · senaste 5: shots on goal per game, last 5 games (from game event pages)
- SA/match · senaste 5: shots against per game, last 5 games (from game event pages)
- SF/match · säsong: SOG÷GP from ScoringAndGoalkeeping stats page
- SA/match · säsong: SOA÷GP from Goalkeeping Efficiency stats page
Green value = better team for that stat (higher SF = better, lower SA = better).

**PeriodsCard** (Mål per period) — anchor: #periods
Goals scored and conceded per period for the season.

**ScorersCard** (Poängliga) — anchor: #scorers
Top point scorers per team.

**GoaliesCard** (Målvakter) — anchor: #goalies
Goalie stats per team (save%, GAA, GP).

**SpecialTeamsCard** (Special teams) — anchor: #special
PP% and PK% with goal counts and opportunity totals:
- Powerplay: PP% + "X mål / Y tillfällen"
- Boxplay: PK% + "X insläppta / Y tillfällen"
Data from stats.swehockey.se/Teams/Statistics/PowerplayAndPenaltyKilling/{competitionId}
Columns: Rk, Team, GP, ADV/DVG (index 3), PPGF/PPGA (index 4), PP%/PK% (index 5)

**DisciplineCard** (Utvisningsminuter) — anchor: #discipline
Penalty minutes per team for the season.

**FaceoffsCard** (Tekningar FO%) — anchor: #faceoffs
Team FO% + total "X vunna / Y tekningar". Top 3 individual faceoff players (min 10 draws).

**LineupDiffCard** (Laguppställning) — anchor: #lineup
Compares tonight's lineup vs last played game lineup.
Source: /Game/LineUps/{gameId} — published by swehockey ~30-60 min before puck drop.
Shows: In (new players tonight) / Ut (players not in tonight's lineup).
If tonight's lineup not yet published: "Laguppställning ej publicerad ännu."
If no game today: "Ingen match idag."

**StreakAlertsCard** (Sviter) — anchor: #streaks
Notable streaks for either team.

**RestDaysCard** (Vila sedan senaste match) — anchor: #rest
Days since each team's last game.

**WinProbabilityCard** (Vinstchans) — anchor: #probability
Shown at the bottom of the briefing.
Hover tooltip explains formula:
- 70% season PPG ÷ 3 (normalised to 0–1)
- 30% venue win rate (home team's home record, away team's away record)
- Home team gets +10% strength boost
- Final = home strength ÷ (home + away strength)

---

## 10. Roster Scraping

All scraper fetches use fetchWithTimeout (10s AbortController) and withRetry
(3 attempts, 500ms -> 1s -> 2s backoff).

scrapeTeamRoster: Two-stage block extraction (heading or anchor ID). Row filtering
removes header rows, summary rows, short names, rows with <4 non-empty cells.

scrapeTeamCodes: Parses navigation links from the same page.

scrapeLiveGames: Fetches /ScheduleAndResults/Live/{competitionId}. Returns empty
array on off-season days.

fetchTonightsLineup: Finds today's unplayed game in scheduleGames, fetches
/Game/LineUps/{gameId}, cross-references with roster for numbers/positions,
distributes players into vMix slot positions.

---

## 11. Scraping Patterns and Gotchas

- Firecrawl converts <a href="url">text</a> to [text](url) in markdown
  → Strip with .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") before regex filters
  → This affected lastFive: games with linked scores were filtered out

- ScoringAndGoalkeeping page has TWO tables (Scoring + Goalkeeping Efficiency)
  → Both have SOG at column index 5
  → Split on first </table> after "Scoring Efficiency" text to isolate sections

- Special teams page team cells: <span title="Full Name"><strong>ABBR</strong></span>
  → Use titleRe to extract full team name from title attribute

- Lineup page section regex accepts any (text) not just (Red|White)
  → Swedish pages may use (Röd)/(Vit) or other variants

- schedule HTML (/ScheduleAndResults/Schedule/{competitionId}) is partially JS-rendered
  → Direct fetch only returns some rounds
  → Use Firecrawl (scrapeMd) for lastFive data — it sees all 38 rounds
  → fetchAllScheduleGames (direct fetch) is fine for venueForm and other uses

---

## 12. Configuration

Hardcoded constants in SETTING_DEFAULTS (vmix.functions.ts):
asset_base_url: "" -> Supabase Storage
club_id: "570"
lineup_version: "0"

Competition ID 2025-26: 18271 (stored in seasons.config.ts)
Competition ID 2026-27: TBD (will be auto-detected via season scan)

Rate limiting: 120 req/min per IP, in-memory per Worker instance, internal
requests exempt (IP = "unknown"), 5000 entry prune threshold.

Scheduled tasks via pg_cron:
Pre-game emails: /api/public/hooks/pregame-emails
Post-game emails: /api/public/hooks/postgame-emails
Both require: Authorization: Bearer <CRON_SECRET>

---

## 13. Supabase Tables

| Table | Purpose |
|---|---|
| vmix_publications | Publications (JSONB slots + standings). Realtime enabled. |
| team_logo_codes | Team name -> logo code mapping |
| team_logos | Briefing logo URL cache (from Supabase Storage) |
| vmix_lineup_presets | Saved lineup templates |
| vmix_audit_log | Audit trail of all publish actions |
| season_detections | Pending/confirmed/dismissed season detections |
| season_overrides | Confirmed seasons (takes precedence over seasons.config.ts) |
| season_check_meta | Throttle state for season scan |

---

## 14. Error Handling and Resilience

throwIfSupabaseError: standardizes all Supabase error handling.
Scraper resilience: fetchWithTimeout (10s) + withRetry (3 attempts).
Server-side publish validation: blocks empty lineup, missing codes, <8 teams in standings.
Per-card error boundaries: CardErrorBoundary on every major admin card.
Non-blocking audit log: failures silently ignored.
Rate limiter exemption: internal health check requests bypass rate limiting.

---

## 15. File Structure

src/lib:
  seasons.config.ts       - competitionId per season (baseline; DB overrides take precedence)
  vmix.functions.ts       - All vMix server functions + types + fetchTonightsLineup
  vmix.server.ts          - Scrapers + fetchWithTimeout + withRetry
  vmix-assets.ts          - Asset URL resolution + ASCII-safe codes
  vmix-health.functions.ts- Server-side vMix health check
  rate-limiter.ts         - In-memory per-IP rate limiting
  stats.server.ts         - Standings + briefing scrapers + league players
  stats.functions.ts      - Server function wrappers + TeamBriefing schema + CACHE_VERSION
  game-flow.server.ts     - Per-game event scraping, lineup parsing, shot data
  game-flow.functions.ts  - Server function wrappers for game flow
  team-short-names.ts     - Full team name → short code map (e.g. "Grästorps IK" → "GRÄ")
  briefing-export.ts      - Kopiera som text/markdown logic
  team-logos.functions.ts - Team logo cache admin functions
  team-logos.server.ts    - Logo URL building from Supabase Storage

src/routes:
  index.tsx               - Dashboard (briefing, recap, auto-refresh, tablet mode,
                            compact match banner, admin dropdown, SeasonPicker inline)
  info.tsx                - Public info/landing page (HockeyEttan Stats)
  auth.tsx                - Login + sign-up (two flows: regular vs admin)
  schema.tsx              - Schedule page
  spelare.tsx             - Player stats (filters position G)
  compare.tsx             - Jämför lag (standings + league overview)
  _authenticated/
    admin.vmix.tsx        - vMix admin (all lineup + publish functionality)
    admin.health.tsx      - Scraper health + vMix endpoint health check
    admin.users.tsx       - Admin user management
    admin.assets.tsx      - Lagring: vMix assets + briefing logo cache
    admin.auth-emails.tsx - Email system admin
    admin.logs.tsx        - Application logs
  api/public/vmix/
    lineup.$version.ts    - Rate-limited
    standings.ts          - Rate-limited
    titlecard.ts          - Rate-limited
    todays-games.ts       - Rate-limited
    player.ts             - Rate-limited, needs ?PlayerName=
    current.ts            - Game metadata (internal use)

public/
  briefing-anchors.json   - Stream Deck anchor definitions
  CLAUDE.md               - Claude Code session reference (repo root)

---

## 16. Season Switchover Procedure

When a new season competition ID appears on swehockey:

1. Log in as admin — season scan runs automatically on login
   OR click "Skanna efter ny säsong" in Datakälla card header
2. PendingSeasonsBanner appears — click Confirm
   (stored in season_overrides table, seasons.config.ts not required to change)
3. Update team-short-names.ts if new teams have joined Södra
   (2026-27: add BOR/Boro/Vetlanda HC, TRO/IF Troja-Ljungby; remove VIS/Visby/Roma HK)
4. Upload logos for new teams to vmix-assets/logos/ (ASCII-safe filenames)
5. /admin/assets → Cachelagda logotyper → Hämta om for new team logos
6. Optionally update seasons.config.ts to bake in the new ID permanently

---

## 17. Pre-Broadcast Workflow

Before season starts:
1. Confirm new competition ID (via season scan or swehockey URL)
2. /admin/vmix -> expand Logotypkoder -> Synka från Swehockey
3. Upload logo PNGs to vmix-assets/logos/ (ASCII-safe names)
4. Upload resources to vmix-assets/resources/
5. /admin/assets -> Cachelagda logotyper -> Hämta om for missing logos
6. Set up Companion buttons using public/briefing-anchors.json

Game day:
1. Open /admin/vmix
2. Check Förberedelsekontroll — all green before broadcast
3. Enter puck drop time in countdown field
4. Restore or ignore any saved draft
5. Verify Datakälla shows correct matchup (auto mode if home game)
6. Verify Logotypkod filled for both teams
7. If auto mode: check if lineup was pre-filled from swehockey — review positions
8. If manual mode or lineup not yet published: fill slots from actual game lineup sheet
9. Ladda spelarlistan to load roster dropdowns for both teams
10. Check amber warnings in sticky bar
11. Publicera till vMix -> review -> confirm
12. Verify diff summary
13. In vMix-endpoints card: Testa alla — all green
14. Enable Auto 60s to monitor throughout broadcast
15. If primary API fails: change domain in vMix
16. If standings change: Uppdatera tabell
17. After broadcast: Avsluta sändning

---

## 18. Quick Reference

Competition ID 2025-26: 18271
Club ID Grästorps IK: 570
Official lineup: https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
Official standings: https://vmix-new.hockeyettan.se/api/tabel/
Backup base: https://hockeyettan-stats.spdproduktion.se
Backup lineup: /api/public/vmix/lineup/0?ClubId=570
Backup standings: /api/public/vmix/standings
Backup titlecard: /api/public/vmix/titlecard
Backup today's games: /api/public/vmix/todays-games
Backup player: /api/public/vmix/player?PlayerName=...
Storage bucket: vmix-assets (only bucket in use)
Default team: Grästorps IK
Briefing anchors: public/briefing-anchors.json
Rate limit: 120 req/min per IP (internal exempt)
Cache version: bump CACHE_VERSION in stats.functions.ts when changing TeamBriefing schema (currently v22)
Auto-refresh interval: 60 seconds

---

## 19. Future Plans

- Bitfocus Companion integration for Stream Deck vMix source switching
- Further briefing card improvements as the season approaches
- Test full workflow in pre-season matches (from 24 August 2026)
- Season 2026-27 kicks off ~20 September 2026

---

End of reference document.
