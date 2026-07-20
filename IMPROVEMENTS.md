# Origin Point Play – Improvement Backlog
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

---

## Workflow notes

- All code changes use exact delete/replace blocks — never "insert between"
- GitHub web editor for most changes; Lovable for multi-file coordinated edits
- Always include approximate line numbers with every change
- When modifying an existing line, always show the full original line in the
  delete block and the full new line in the replace block
- For any single replace block over ~30 lines in a large file, use Lovable
- Use downloadable files for any code or text block over ~50 lines
- Lovable dev server restart often needed after multiple rapid GitHub commits
- Always test on production URL (hockeyettan-stats.spdproduktion.se) not preview URL
