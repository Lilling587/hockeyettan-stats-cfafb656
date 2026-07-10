Three connected features that all pull from the swehockey game-event pages we already parse for last-meeting recaps. One shared scraper, three cards on the briefing.

## 1. Shot timeline (not a shot map)

Reality check first: swehockey.se for HockeyEttan does NOT publish shot x/y coordinates, so a real heat-map / rink chart isn't possible without a different data source. What we can build is a **shot timeline card**:

- Per period bars: shots for / shots against for the last 5 played games and season averages.
- "Shot differential" mini-line per game (SF − SA over last 10 games).
- Season totals: SF/60, SA/60, SF% (Corsi-lite, using shots not attempts).

Card placement: new `ShotTimelineCard` in `src/components/dashboard/cards/`, rendered per team in the briefing (below `ShotVolumeCard`).

## 2. Special-teams timeline

Today `SpecialTeamsCard` shows only season PP% / PK%. Add a trend:

- Last 10 games: PP goals for, PP opportunities, PPG allowed, PK opportunities.
- Rolling PP% and PK% (5-game window) rendered as sparklines.
- "vs. season average" delta badge (e.g. PP hot: +6.2%).
- Flag PP-heavy referees if referee data is present on the game page (nice-to-have; skip if absent).

Replaces the current card body but keeps the same slot.

## 3. Lineup diff

- Scrape each team's roster page (`/Teams/Info/TeamRoster/<compId>`) — the URL is already built in `stats.server.ts`.
- Scrape the last played game's box score to get who dressed.
- Diff: **In tonight's expected lineup but didn't play last game** (returning) vs **played last game but not on current roster / marked injured** (out).
- Because swehockey doesn't publish confirmed tonight-lineups, label the card clearly: "Senast spelade laguppställning · avvikelser mot truppen".
- New `LineupDiffCard` shown per team.

## Technical section

**New server function** (`src/lib/stats.functions.ts`):
- `getGameFlow({ team, season })` → returns `{ shotSeries, specialTeamsSeries, lineupDiff }` for one team.
- Cached 6h in `cached_briefings`-style key: `gameFlow:v1:<season>:<team>`.

**New server helpers** (`src/lib/stats.server.ts` or a new `game-flow.server.ts`):
- `fetchGameEventPage(gameId)` — one parser that returns `{ shotsForHome, shotsForAway, shotsByPeriod, ppGoalsFor/Against, ppOpportunities, penalties, goals, dressedPlayers[] }`. Reuses the existing `Game/Events/<id>` fetch and regex patterns.
- `fetchLastNGamesForTeam(team, season, n=10)` — walks schedule, calls `fetchGameEventPage` for each, coalesces concurrent calls.
- `fetchCurrentRoster(team, season)` — parses the roster markdown we already scrape.

**Coalescing / cost control:**
- Wrap each `fetchGameEventPage(id)` in an in-memory promise map so a single briefing render doesn't fetch the same game twice.
- Persist per-game parsed JSON in a new `game_events_cache` table keyed by `game_id` (immutable once played) — future briefings and post-game recap all reuse it, no re-scrape.

**Migration:**
```sql
CREATE TABLE public.game_events_cache (
  game_id text PRIMARY KEY,
  season text NOT NULL,
  parsed jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_events_cache TO authenticated;
GRANT ALL ON public.game_events_cache TO service_role;
ALTER TABLE public.game_events_cache ENABLE ROW LEVEL SECURITY;
-- read: no policy needed for server-only access via service_role; add anon SELECT only if the client reads it directly.
CREATE INDEX game_events_cache_season_idx ON public.game_events_cache (season);
```

**UI:**
- `src/components/dashboard/cards/shot-timeline-card.tsx`
- `src/components/dashboard/cards/special-teams-timeline-card.tsx` (replaces contents of `special-teams-card.tsx`, keeping season snapshot on top)
- `src/components/dashboard/cards/lineup-diff-card.tsx`
- Wired into `briefing-view.tsx` in the existing per-team grid pattern.
- Sparklines: reuse `recharts` (already in the project via other cards) — no new dependency.

**Fallbacks:**
- If a game-event page is missing or times out, render "Data saknas" placeholder for that row, never crash the briefing.
- Log parse failures via `recordScrape` so `/admin/health` shows the miss rate.

**Out of scope (call out to user):**
- True shot heat-map with x/y coordinates — not available in swehockey markup.
- Confirmed tonight's starting lineup — swehockey doesn't publish it; the diff is "last-played vs current roster".

## Rollout order

1. Migration + `game_events_cache` + `fetchGameEventPage` + coalescing.
2. `getGameFlow` server function returning all three payloads.
3. Shot timeline card + wire into briefing.
4. Special-teams timeline card (replace existing card body).
5. Lineup diff card.
6. Verify by loading a real matchup in the preview, checking `/admin/health` for scrape counts.
