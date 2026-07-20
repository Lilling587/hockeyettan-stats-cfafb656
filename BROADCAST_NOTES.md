# Origin Point Play – Broadcast Reference Document
*Last updated: July 2026*

---

## 1. What Is This App and Why Does It Exist?

**Origin Point Play** is a broadcast support tool built for HockeyEttan Södra coverage
at Grästorps IK. It serves three purposes:

**Purpose 1: Match Briefing**
The main dashboard scrapes stats.swehockey.se and produces a comprehensive pre-game
briefing for producers and commentators: head-to-head history, current form, top
scorers, goalie stats, special teams percentages, power play data, and more. Features
include auto-refresh (every 30 minutes when enabled) and a tablet-optimized mode for
the commentator touchscreen.

**Purpose 2: vMix GT Designer Backup Data Source**
The primary data source for vMix broadcast graphics is the official Swehockey vMix API
at https://vmix-new.hockeyettan.se/api/. This API experienced reliability issues during
peak load during the 2024-25 season. Origin Point Play acts as a manual backup — the
producer publishes lineup and standings data through the admin UI before the game. If
the real API fails during broadcast, vMix is switched to the backup endpoint by changing
only the domain in the data source URL.

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
| Repository | github.com/Lilling587/origin-point-play-0cae653e |
| Lovable project ID | b5d9d92f-3d6c-4d04-99c2-25be99cec0a2 |
| Production URL | https://hockeyettan-stats.spdproduktion.se |
| Email scheduling | pg_cron (via Lovable Supabase) with Resend |

---

## 3. Code Change Workflow

All code changes go via the GitHub web editor, committing directly to main.

Lovable credits are reserved for multi-file coordinated changes or when a single
replace block exceeds ~30 lines in a large file. The GitHub-to-Lovable sync is
automatic via webhook.

Change format: All code instructions use exact DELETE THIS / REPLACE WITH THIS
blocks. Approximate line numbers are always included. Blocks over ~50 lines are
provided as downloadable files to avoid clipboard truncation.

Dev server restarts: Lovable dev server sometimes serves stale code after GitHub
commits. If behaviour does not match the code, restart the dev server. Always
test on the production URL, not the Lovable preview URL.

Permanently banned: Force-pushing, rebasing, amending pushed commits, squashing
pushed commits. These break the bidirectional Lovable to GitHub sync.

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

Scrapes /ScheduleAndResults/Live/18271 on swehockey.
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

Only the domain changes.

---

## 6. Asset Storage (Supabase Storage)

Only the vmix-assets bucket is used. Old buckets (logos, team-logos) were deleted.

Bucket structure:
  vmix-assets/logos/     <- Team logos (small + large per team)
  vmix-assets/resources/ <- lineup-PLATE.png, transparent.png, lineupBG.png,
                            lineup-DIVISION.png

The large logo (*_large.png) serves BOTH vMix graphics AND the stats briefing
dashboard. Uploading in admin/assets under Logotyper (vMix) -> Large updates both.

ASCII-safe filenames: GRA (for GRA), MOR (for MOR), VAS (for VAS), MJO (for MJO).

### 6.1 Briefing Logo Cache

team_logos database table caches logo URLs with 7-day localStorage TTL.
URLs now point to Supabase Storage instead of hockeyettan.se.
Managed via "Cachelagda logotyper (statistiksida)" card in /admin/assets.
"Hamta om" button uses supabaseAdmin (service role) to bypass RLS.

---

## 7. Team Logo Codes System

Maps team names to short codes (e.g. "Grastorps IK" -> "GRA").
Stored in team_logo_codes table (team_name, logo_code, source, updated_at).
Synced from swehockey roster page navigation links.
Manual overrides preserved during sync.
Auto-fills Logotypkod field in admin page when team is selected.
Codes enriched into standings rows at publish time.

---

## 8. The Admin vMix Page (/admin/vmix)

Collapsible-card based. Always visible: Forberedelsekontroll, Datakalla, season
selector, two lineup editors, sticky publish bar. CardErrorBoundary on each major card.

### 8.1 Forberedelsekontroll (Readiness Card)

Shows go/no-go for: away team selected, active publication, hemma-lineup completeness,
borta-lineup completeness, logo codes synced, official Swehockey API status (60s poll).
Card border: green (all OK) / amber (warnings) / red (errors).
Broadcast countdown timer: enter puck drop time HH:MM for live T-minus display.

### 8.2 Draft Auto-Save

Form state saved to localStorage every 5 seconds (skips if unchanged). Restore banner
on next visit. Draft cleared on successful publish.

### 8.3 Datakalla Card

Status badges: AUTO green (home game found), AUTO outline (no game), LIVE (publication
hydrated), MANUELL amber (manual override).

### 8.4 Season Selector

Dropdown above Datakalla. Selects competition ID for roster scraping.

### 8.5 Logotypkoder Card (collapsible)

Inline editing of team logo codes. "Synka fran Swehockey" button.

### 8.6 vMix-endpoints Card (collapsible)

COMBINED reference + tester card. Each endpoint shows URL + copy + open + status badge
+ response time + refresh button in one row. "Auto 60s" and "Testa alla" always visible
in header even when collapsed. Alert fires when endpoint transitions from OK to error.
Endpoints: standings, lineup, titlecard, todays-games.

### 8.7 Publication History Card (collapsible)

Last 5 publications. Active = green LIVE badge. Others have "Anvand" button to load
that publication's data into the form for re-publishing.

### 8.8 Granskningslogg Audit Log (collapsible)

Last 20 audit events. Written by logAuditEvent (non-blocking).

### 8.9 Lineup Editor Cards

Team dropdown (auto-fills Logotypkod), Logotypkod field, "Ladda spelarlistan" button
(10s timeout, 3-retry backoff), roster badge, error banner, slot grid.
Position "G" excluded from dropdown (misidentified Goals column from stats page).

### 8.10 Lineup-mallar Card (collapsible)

Save/restore presets. Filtered to show presets matching current teams.

### 8.11 Sticky Bottom Bar

Publicera till vMix -> confirmation dialog -> publish + fetch standings
Avpublicera -> red confirmation dialog
Uppdatera tabell -> re-scrape standings only
Exportera JSON -> download current lineup JSON
Avsluta sandning -> confirmation -> unpublish + clear draft + reset form
Below: timestamp + diff summary (+ added, - removed, <-> changed)

### 8.12 Server-Side Publish Validation

Blocks publish if: home lineup empty, logo code missing, standings scrape <8 teams.

---

## 9. Commentator Dashboard

URL anchors for Stream Deck navigation (see public/briefing-anchors.json):
#form, #venue, #periods, #h2h, #scorers, #goalies, #shots, #special,
#probability, #hot, #streaks, #discipline

Features:
- Auto-refresh every 30 minutes (toggle button)
- Tablet mode: larger text (text-xl), more spacing (space-y-10), green toggle button
- Compact match banner after loading (collapses team selector)
- Keyboard shortcuts: 1=Briefing, 2=Recap, L=Load, R=Refresh, P=Print, ?=Help
- Export: "Kopiera som text" (TV-mall, goalies sorted by save%) and "Kopiera som markdown"

Hardware: Lenovo ThinkCentre M720Q + 15.6" portable USB-C touchscreen.

---

## 10. Roster Scraping

All scraper fetches use fetchWithTimeout (10s AbortController) and withRetry
(3 attempts, 500ms -> 1s -> 2s backoff).

scrapeTeamRoster: Two-stage block extraction (heading or anchor ID). Row filtering
removes header rows, summary rows, short names, rows with <4 non-empty cells.

scrapeTeamCodes: Parses navigation links from the same page.

scrapeLiveGames: Fetches /ScheduleAndResults/Live/{competitionId}. Returns empty
array on off-season days.

---

## 11. Configuration

Hardcoded constants in SETTING_DEFAULTS (vmix.functions.ts):
asset_base_url: "" -> Supabase Storage
club_id: "570"
lineup_version: "0"

Competition ID 2025-26: 18271 (stored in seasons.config.ts)

Rate limiting: 120 req/min per IP, in-memory per Worker instance, internal
requests exempt (IP = "unknown"), 5000 entry prune threshold.

Scheduled tasks via pg_cron:
Pre-game emails: /api/public/hooks/pregame-emails
Post-game emails: /api/public/hooks/postgame-emails
Both require: Authorization: Bearer <CRON_SECRET>

---

## 12. Supabase Tables

| Table | Purpose |
|---|---|
| vmix_publications | Publications (JSONB slots + standings). Realtime enabled. |
| team_logo_codes | Team name -> logo code mapping |
| team_logos | Briefing logo URL cache (from Supabase Storage) |
| vmix_lineup_presets | Saved lineup templates |
| vmix_audit_log | Audit trail of all publish actions |
| season_detections | Pending/confirmed/dismissed season detections |
| season_overrides | Confirmed seasons |
| season_check_meta | Throttle state for season scan |

---

## 13. Error Handling and Resilience

throwIfSupabaseError: standardizes all Supabase error handling.
Scraper resilience: fetchWithTimeout (10s) + withRetry (3 attempts).
Server-side publish validation: blocks empty lineup, missing codes, <8 teams in standings.
Per-card error boundaries: CardErrorBoundary on every major admin card.
Non-blocking audit log: failures silently ignored.
Rate limiter exemption: internal health check requests bypass rate limiting.
Health check localhost fix: https://localhost downgraded to http: in dev.

---

## 14. File Structure

src/lib:
  seasons.config.ts       - competitionId per season
  vmix.functions.ts       - All vMix server functions + types
  vmix.server.ts          - Scrapers + fetchWithTimeout + withRetry
  vmix-assets.ts          - Asset URL resolution + ASCII-safe codes
  vmix-health.functions.ts- Server-side vMix health check
  rate-limiter.ts         - In-memory per-IP rate limiting
  stats.server.ts         - Standings + briefing scrapers + league players
  stats.functions.ts      - Server function wrappers
  briefing-export.ts      - Kopiera som text/markdown logic
  team-logos.functions.ts - Team logo cache admin functions
  team-logos.server.ts    - Logo URL building from Supabase Storage

src/routes:
  index.tsx               - Dashboard (briefing, recap, auto-refresh, tablet mode,
                            compact match banner, admin dropdown, SeasonPicker inline)
  auth.tsx                - Login + sign-up (two flows: regular vs admin)
  schema.tsx              - Schedule page
  spelare.tsx             - Player stats (filters position G)
  compare.tsx             - Jamfor lag (standings + league overview)
  _authenticated/
    admin.vmix.tsx        - vMix admin (all lineup + publish functionality)
    admin.health.tsx      - Scraper health + vMix endpoint health check
    admin.users.tsx       - Admin user management
    admin.assets.tsx      - Lagring: vMix assets + briefing logo cache
                            (merged from old admin.logos.tsx)
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
  icon-192.png            - PWA icon
  icon-512.png            - PWA icon (high-res)

---

## 15. Pre-Broadcast Workflow

Before season starts:
1. Verify competitionId in seasons config
2. /admin/vmix -> expand Logotypkoder -> Synka fran Swehockey
3. Upload logo PNGs to vmix-assets/logos/ (ASCII-safe names)
4. Upload resources to vmix-assets/resources/
5. /admin/assets -> Cachelagda logotyper -> Hamta om for missing logos
6. Set up Companion buttons using public/briefing-anchors.json

Game day:
1. Open /admin/vmix
2. Check Forberedelsekontroll - all green before broadcast
3. Enter puck drop time in countdown field
4. Restore or ignore any saved draft
5. Verify Datakalla shows correct matchup
6. Verify Logotypkod filled for both teams
7. Ladda spelarlistan on both cards - verify green badges
8. Fill slots from actual game lineup sheet
9. Check amber warnings in sticky bar
10. Publicera till vMix -> review -> confirm
11. Verify diff summary
12. In vMix-endpoints card: Testa alla - all green
13. Enable Auto 60s to monitor throughout broadcast
14. If primary API fails: change domain in vMix
15. If standings change: Uppdatera tabell
16. After broadcast: Avsluta sandning

---

## 16. Quick Reference

Competition ID 2025-26: 18271
Club ID Grastorps IK: 570
Official lineup: https://vmix-new.hockeyettan.se/api/lineup/0?ClubId=570
Official standings: https://vmix-new.hockeyettan.se/api/tabel/
Backup base: https://hockeyettan-stats.spdproduktion.se
Backup lineup: /api/public/vmix/lineup/0?ClubId=570
Backup standings: /api/public/vmix/standings
Backup titlecard: /api/public/vmix/titlecard
Backup today's games: /api/public/vmix/todays-games
Backup player: /api/public/vmix/player?PlayerName=...
Storage bucket: vmix-assets (only bucket in use)
Default team: Grastorps IK
Briefing anchors: public/briefing-anchors.json
Rate limit: 120 req/min per IP (internal exempt)
Auto-refresh interval: 60 seconds

---

## 17. Future Plans

- Broadcast countdown timer on homepage (currently admin only)
- Bitfocus Companion integration for Stream Deck vMix source switching

---

End of reference document.
