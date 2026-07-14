# Origin Point Play – Improvement Backlog
*Created: July 2026 · Updated: July 2026*

---

## Status of original items 1–20

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
| 16 | TypeScript strict mode audit | ⚠️ Partial (as unknown as Json casts remain in publishVmix; lower-risk casts fixed)
| 17 | Server function error standardization | ✅ Done (throwIfSupabaseError standardizes Supabase errors throughout; full ok/error return pattern not needed)|
| 18 | In-memory cache for getActivePublication | ✅ Done |
| 19 | Loading skeletons throughout admin page | ✅ Done |
| 20 | Collapsible cards on admin page | ✅ Done |
| — | Lineup presets filtered per team | ✅ Done |---

## Remaining from original list

### 16. TypeScript strict mode audit
Several `as unknown as` casts and `Record<string, unknown>` patterns remain in
`vmix.functions.ts` and `admin.vmix.tsx`. A focused pass to use the
Supabase-generated types from `types.ts` on all DB queries would catch type
mismatches at compile time.

### 17. Server function error standardization (partial)
`throwIfSupabaseError` now standardizes Supabase errors. The remaining gap is
inconsistent return shapes in other server functions — some throw, some return
defaults silently, some mix both approaches. A full `{ ok: true, data: T }` /
`{ ok: false, error: string }` pattern across all server functions would make
client-side error handling predictable.

### 19. Loading skeletons (partial)
Skeletons exist in the non-admin guard state of `admin.vmix.tsx` and in parts
of the dashboard. The roster list, publication history entries, and team codes
list still show raw Loader2 spinners or empty states while loading.

### — Lineup presets: filter by team (untracked)
Currently all presets are shown in one flat list regardless of which teams
are selected. Showing only presets matching the current home or away team
would reduce clutter as the list grows over a season.

---

## New improvements (added July 2026)

### Broadcast Safety

#### 21. "Avpublicera" confirmation dialog — CRITICAL
"Avpublicera" in the sticky bar executes immediately on click with no
confirmation. An accidental click during a live broadcast kills the vMix feed
instantly. Needs the same AlertDialog pattern as "Publicera till vMix", with
clear red danger language: "Du håller på att avpublicera den aktiva
sändningen. vMix tappar anslutningen direkt."
**Effort:** Small (JSX only). **Priority:** Highest.

#### 22. "Använd manuell inmatning" confirmation when slots are filled
`resetToManual()` calls `setHomeSlots(emptySlots(...))` unconditionally.
If called after filling 20 slots, all work is lost. Should check
`countFilledSlots()` first and prompt for confirmation before wiping.
**Effort:** Small. **Priority:** High.

#### 23. Session expiry proactive warning
Supabase JWTs expire after 1 hour. If the session expires mid-broadcast
while the producer is editing (not navigating), the next publish call fails
silently with an auth error at the worst moment. Read `session.expires_at`
on mount and show an amber warning banner 5 minutes before expiry.
**Effort:** Medium. **Priority:** High.

#### 24. `beforeunload` warning with unsaved changes
If the producer closes the tab or navigates away while slots are filled but
not yet published, work can be lost in the 5-second localStorage save window.
Add a `window.beforeunload` handler that fires when current slots differ from
the active publication.
**Effort:** Small. **Priority:** High.

### Backend Resilience

#### 25. Scraper fetch timeout (10-second AbortController)
The roster and standings scrapers have no explicit timeout on `fetch()` calls
to swehockey.se. A hanging connection (server slow, not refusing) blocks the
Cloudflare Worker for up to 2 minutes. Add `AbortController` + `setTimeout`
with a 10-second cap on every external fetch.
**Effort:** Small. **Priority:** High.

#### 26. Scraper retry with exponential backoff
Transient Swehockey errors (brief 503, connection reset) cause immediate
failure. 2–3 retries with delays of 500ms → 1000ms → 2000ms would silently
handle most transient failures without producer involvement.
**Effort:** Medium. **Priority:** High.

#### 27. Server-side validation on publishVmix
Client-side guards (warnings, disabled state, confirmation dialog) can be
bypassed by UI bugs. Add Zod validation in the `publishVmix` server function
itself: require non-empty homeTeam/awayTeam, non-empty teamCodes, and at
least one filled slot before writing to the database.
**Effort:** Small. **Priority:** Medium.

#### 28. Supabase Realtime for multi-user publish awareness
If two producers use the admin simultaneously, one publishing or restoring
will not update the other's screen until manual refresh. Subscribe to
`postgres_changes` on `vmix_publications` and invalidate `vmix-active` and
`vmix-history` queries on any change. Requires enabling Replication on
that table in Supabase dashboard.
**Effort:** Medium. **Priority:** Medium.

### Observability

#### 29. Proactive alert when vMix endpoint fails during Auto 10s monitoring
The endpoint tester polls silently — failures just update the status badge.
During broadcast, if an endpoint starts failing while the producer is focused
on the lineup, nobody notices until vMix graphics go dark. When "Auto 10s"
is active and any endpoint transitions from OK to error, show a persistent
red banner above AdminNav and optionally fire a browser notification.
**Effort:** Medium. **Priority:** Medium.

#### 30. Per-card error boundaries on vMix admin page
If EndpointTester, PublicationHistory, or TeamCodesCard throws a JS error,
the entire VmixAdminPage unmounts. Wrap each major card in a React error
boundary with a minimal fallback that shows the card name and a reload
button. The sticky publish bar must remain accessible even if other cards fail.
**Effort:** Small. **Priority:** Medium.

### UX & Workflow

#### 31. Keyboard shortcuts on vMix admin page
The main dashboard has shortcuts (1/2/L/R/P/?). The vMix admin page has
none. Suggested bindings (with the same typing-target guard):
- **P** → open publish confirmation dialog
- **T** → "Testa alla" in endpoint tester
- **R** → re-run auto matchup detection
- **?** → show shortcut list in a toast
**Effort:** Small. **Priority:** Low.

#### 32. Pre-broadcast readiness card
A compact card at the very top of /admin/vmix showing go/no-go status for
all critical systems: active publication present, lineup completeness for
both teams, logo codes synced, backup endpoint responding. All data is already
loaded by existing queries — this card only aggregates it visually.
**Effort:** Medium. **Priority:** Low.

#### 33. Extended Cache-Control on lineup and standings endpoints
Current value: `Cache-Control: public, max-age=15`. Since data is static
between publishes and the in-memory cache is invalidated immediately on
publish, this can safely be increased to `max-age=30, stale-while-revalidate=60`.
Reduces Cloudflare origin hits during broadcast without risking stale data.
**Effort:** Tiny (one-line change). **Priority:** Low.

#### 34. Emergency JSON export button on active publication
A "Exportera JSON" button in the sticky bar that fetches the live lineup
endpoint and downloads it as `vmix-lineup-backup-{date}.json`. Gives the
producer a local file copy and helps with post-broadcast debugging.
**Effort:** Small. **Priority:** Low.

---

## Recommended next priorities

1. **#21** — Avpublicera confirmation (5 min, prevents catastrophic live fail)
2. **#22** — Manuell inmatning confirmation when slots filled (10 min)
3. **#25** — Scraper fetch timeout (15 min, prevents hanging workers)
4. **#24** — beforeunload warning (15 min)
5. **#26** — Scraper retry with backoff (30 min)
6. **#23** — Session expiry warning (30 min)
7. **#16** — TypeScript audit (ongoing)
