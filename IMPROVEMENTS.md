# HockeyEttan Stats – Improvement Backlog
*Created: July 2026 · Updated: July 2026*

---

## Original items 1–20

| # | Item | Status |
|---|---|---|
| 1 | Dead code cleanup in vmix.functions.ts | ✅ Done |
| 2 | Duplicate comment in admin.vmix.tsx | ✅ Done |
| 3 | Standings freshness indicator | ✅ Done |
| 4 | Confirmation dialog before publish | ✅ Done |
| 5 | Publication history with rollback | ✅ Done |
| 6 | Lineup completeness warnings | ✅ Done |
| 7 | Roster loading state badges | ✅ Done |
| 8 | Persistent error banners for scrape failures | ✅ Done |
| 9 | Mobile-friendly admin page | ✅ Done |
| 10 | Stream Deck commentator dashboard (URL anchors) | ✅ Done |
| 11 | Auto-save draft to localStorage | ✅ Done |
| 12 | Lineup template presets | ✅ Done |
| 13 | Diff summary after publish | ✅ Done |
| 14 | Webhook notifications on publish | ⏭️ Skipped |
| 15 | Remove vmix_settings table | ✅ Done |
| 16 | TypeScript strict mode audit | ⚠️ Partial (publishVmix Supabase cast remains; lower-risk casts fixed) |
| 17 | Server function error standardization | ✅ Done |
| 18 | In-memory cache for getActivePublication | ✅ Done |
| 19 | Loading skeletons throughout admin page | ✅ Done |
| 20 | Collapsible cards on admin page | ✅ Done |
| — | Lineup presets filtered per team | ✅ Done |

---

## Broadcast safety & resilience (items 21–34)

| # | Item | Status |
|---|---|---|
| 21 | "Avpublicera" confirmation dialog | ✅ Done |
| 22 | "Använd manuell inmatning" confirmation when slots filled | ✅ Done |
| 23 | Session expiry proactive warning | ✅ Done |
| 24 | beforeunload warning with unsaved changes | ✅ Done |
| 25 | Scraper fetch timeout (10s AbortController) | ✅ Done |
| 26 | Scraper retry with exponential backoff | ✅ Done |
| 27 | Server-side validation on publishVmix | ✅ Done |
| 28 | Supabase Realtime for multi-user publish sync | ✅ Done |
| 29 | Proactive alert when vMix endpoint fails during auto-refresh | ✅ Done |
| 30 | Per-card error boundaries on vMix admin page | ✅ Done |
| 31 | Keyboard shortcuts on vMix admin page | ⏭️ Skipped (R shortcut too dangerous during manual lineup work) |
| 32 | Pre-broadcast readiness card | ✅ Done |
| 33 | Extended Cache-Control on lineup and standings endpoints | ✅ Done |
| 34 | Emergency JSON export button on active publication | ✅ Done |

---

## vMix endpoints & data (items 35–44)

| # | Item | Status |
|---|---|---|
| 35 | Today's games vMix endpoint (/api/public/vmix/todays-games) | ✅ Done |
| 36 | Players lower-thirds vMix endpoint (/api/public/vmix/player) | ✅ Done |
| 37 | Title card vMix endpoint (/api/public/vmix/titlecard) | ✅ Done |
| 38 | Standings refresh without full republish ("Uppdatera tabell" button) | ✅ Done |
| 39 | Load lineup from previous game vs same opponent | ⏭️ Skipped (single round-robin, no repeat home matchups) |
| 40 | Print-friendly lineup view | ⏭️ Skipped (printed lineups provided by official stats staff) |
| 41 | Quick player swap in lineup slots | ⏭️ Skipped |
| 42 | Standings completeness check before publish (block if <8 teams) | ✅ Done |
| 43 | Rate limiting on public vMix endpoints (120 req/min per IP) | ✅ Done |
| 44 | Audit log for publications (vmix_audit_log table + Granskningslogg card) | ✅ Done |

---

## Commentator dashboard (items 45–46)

| # | Item | Status |
|---|---|---|
| 45 | Commentator dashboard auto-refresh (every 30 min toggle) | ✅ Done |
| 46 | Tablet-optimized commentator mode (larger text + spacing toggle) | ✅ Done |

---

## Broadcast safety – second wave (items 47–51)

| # | Item | Status |
|---|---|---|
| 47 | Official Swehockey API health badge in readiness card (polls every 60s) | ✅ Done |
| 48 | Broadcast countdown timer on admin page (manual puck drop time input) | ✅ Done |
| 49 | Post-game "Avsluta sändning" button (unpublish + clear draft + reset) | ✅ Done |
| 50 | vMix-endpoints and EndpointTester merged into one card | ✅ Done |
| 51 | Auto-refresh interval changed from 10s to 60s (reduce Swehockey load) | ✅ Done |

---

## Logo system overhaul (items 52–54)

| # | Item | Status |
|---|---|---|
| 52 | Logotyper page merged into Lagring page as separate card | ✅ Done |
| 53 | Logo cache (statistiksida) now fetches from Supabase Storage instead of hockeyettan.se | ✅ Done |
| 54 | adminRefetchTeamLogo uses supabaseAdmin (service role) for reliable cache updates | ✅ Done |

---

## Performance optimizations (item 55)

| # | Item | Status |
|---|---|---|
| 55 | React.memo on SlotInputs, memoized slot counts, conditional API polling, countdown via DOM refs, skip unchanged draft saves, player stats cache | ✅ Done |

---

## UI & UX cleanup (items 56–67)

| # | Item | Status |
|---|---|---|
| 56 | Admin header links consolidated into "Admin" dropdown | ✅ Done |
| 57 | SeasonPicker moved inline into team picker grid | ✅ Done |
| 58 | Tab buttons (Matchgenomgång/Matchsammanfattning) moved above Nästa match card | ✅ Done |
| 59 | Team selector collapses to compact banner after briefing loads | ✅ Done |
| 60 | "Välj lag" card title removed | ✅ Done |
| 61 | "XX lag laddade" success indicator removed | ✅ Done |
| 62 | Fixed duplicate Settings icons (Loggbok → ScrollText, Hälsa → Activity) | ✅ Done |
| 63 | Removed duplicate span on HockeyEttan stats link | ✅ Done |
| 64 | Separate login/signup flows: regular users (with sign-up) vs admins (no sign-up) | ✅ Done |
| 65 | Compare page: Top 10 PIM card added (Utvisningsliga), cards renamed to Swedish | ✅ Done |
| 66 | Spelare page: filter out position "G" (misidentified Goals column header) | ✅ Done |
| 67 | Goalie sorted by save percentage in TV text ("Kopiera som text") export | ✅ Done |

---

## Briefing dashboard – card improvements (items 68–83)

| # | Item | Status |
|---|---|---|
| 68 | ShotCard: 4-stat layout — SF/SA senaste 5, SF/SA säsong per team | ✅ Done |
| 69 | ShotCard: season SF from ScoringAndGoalkeeping page (SOG÷GP), season SA from Goalkeeping Efficiency | ✅ Done |
| 70 | ShotCard: table layout with team name columns, center stat labels, green winning value | ✅ Done |
| 71 | ShotCard: section divider between senaste 5 and säsong sections | ✅ Done |
| 72 | ShotCard: removed per-period breakdown (confusing for broadcast use) | ✅ Done |
| 73 | VenueStreakCard: reduced from 10 to 5 games (form-relevant window) | ✅ Done |
| 74 | VenueStreakCard: single-row layout — streak badge and result badges on same line | ✅ Done |
| 75 | VenueStreakCard: streak badge (W2/L3 etc.) made larger and bold to stand out | ✅ Done |
| 76 | LineupDiffCard: simplified to in/out diff between tonight's lineup and last played game | ✅ Done |
| 77 | LineupDiffCard: fetches /Game/LineUps/{gameId} for tonight — shows "Ej publicerad" if not yet up | ✅ Done |
| 78 | HomeAwaySplitCard: renamed header to "Tagna poäng på hemma/borta plan" | ✅ Done |
| 79 | SpecialTeamsCard: added PP goals (PPGF) and PK goals against (PPGA) under percentages | ✅ Done |
| 80 | SpecialTeamsCard: Powerplay/Boxplay labels moved above percentage | ✅ Done |
| 81 | SpecialTeamsTimelineCard: deleted (replaced by improved SpecialTeamsCard) | ✅ Done |
| 82 | WinProbabilityCard: added hover tooltip explaining calculation formula | ✅ Done |
| 83 | FormCard: fixed lastFive — Firecrawl markdown link stripping (scores in [N-N](url) format were missed) | ✅ Done |

---

## Admin/vMix improvements (items 84–89)

| # | Item | Status |
|---|---|---|
| 84 | Auto mode: fetches tonight's published lineup from swehockey and pre-fills slots | ✅ Done |
| 85 | Manual mode: always starts with empty slots (deliberate producer input) | ✅ Done |
| 86 | Season scan button added to Datakälla card header (scans for new competition ID without logout) | ✅ Done |
| 87 | PendingSeasonsBanner shown above Datakälla card when new season detected | ✅ Done |
| 88 | Season dropdown placeholder shows actual season label instead of "Standard" | ✅ Done |
| 89 | Admin/vmix subtitle cleaned up ("GT Designer" removed) | ✅ Done |

---

## Scraper & data fixes (items 90–94)

| # | Item | Status |
|---|---|---|
| 90 | fetchTeamCodeMap: replaced broken roster-page HTML parse with shortTeamName() lookup | ✅ Done |
| 91 | fetchTeamShotsOnGoal: splits page on </table> boundary to isolate Scoring vs Goalkeeping tables | ✅ Done |
| 92 | fetchSpecialTeamsFromHtml: extended to extract PPGF (cells[4]) and PPGA (cells[4]) alongside PP%/PK% | ✅ Done |
| 93 | CACHE_VERSION bumped to v16 to invalidate briefings missing shotsAgainstPerGame | ✅ Done |
| 94 | extractLastFiveRows: strips Markdown links before score filter — fixes missing games where score is [N-N](url) | ✅ Done |

---

## Project infrastructure (items 95–97)

| # | Item | Status |
|---|---|---|
| 95 | CLAUDE.md created — Claude Code session reference with stack, git rules, patterns, constants | ✅ Done |
| 96 | GitHub repo renamed to hockeyettan-stats (from origin-point-play-0cae653e) | ✅ Done |
| 97 | Info page header renamed to "HockeyEttan Stats" with updated tagline | ✅ Done |

---

## Notes

- pg_cron via Lovable handles pregame/postgame email scheduling
- CRON_SECRET environment variable set in Lovable
- Supabase Realtime enabled on vmix_publications table via SQL
- vmix_audit_log table created via SQL migration
- Rate limiter exempts internal server-to-server requests (IP = "unknown")
- vMix health check in admin/health uses same 4 endpoints as the vMix-endpoints card
- All public vMix endpoints now rate-limited to 120 req/min per IP
- Player lower-thirds endpoint: /api/public/vmix/player?PlayerName=LASTNAME,%20FIRSTNAME
- Logo files in vmix-assets/logos/ serve both vMix (small+large) and the briefing dashboard (large)
- Old Supabase buckets "logos" and "team-logos" were deleted — only "vmix-assets" is used
- schedule HTML (/ScheduleAndResults/Schedule/18271) is partially JS-rendered; direct fetch only returns some rounds — use Firecrawl-based parsers (scrapeMd) for lastFive data
- Firecrawl converts <a href="...">text</a> to [text](url) — strip before applying score regex
- ShotCard season SF/SA sourced from stats.swehockey.se/Teams/Statistics/ScoringAndGoalkeeping/{competitionId}

---

## Workflow notes

- github.dev (press . on any GitHub repo page) is the primary single-file editing environment
- Ctrl+F in github.dev to search — use this instead of approximate line numbers when unsure
- Claude Code used for debugging, multi-file refactoring, and understanding codebase
- All code changes use exact DELETE / REPLACE WITH blocks with search text
- Commit message goes at the END of each file's changes (not the top)
- Blocks over ~50 lines provided as downloadable files
- Lovable in-app preview is often stale — open in new browser tab for reliable preview
- Always test on production URL (hockeyettan-stats.spdproduktion.se) not preview URL
- Never force push, rebase, amend, or squash pushed commits — breaks Lovable↔GitHub sync
- Claude Code: always commit directly to main, never create pull requests
