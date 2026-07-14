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

## New items 21–34

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

## Notes

- pg_cron via Lovable handles pregame/postgame email scheduling
- CRON_SECRET environment variable set in Lovable
- Supabase Realtime enabled on vmix_publications table
