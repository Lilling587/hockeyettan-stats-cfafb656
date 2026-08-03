# More commentator stats — pre-game storytelling nuggets

## Goal
Give commentators richer pre-game storylines by surfacing narrative-ready facts alongside the existing numbers. The work is scoped to new dashboard briefing cards and a small admin curation UI.

## What we already have
The match briefing already shows: standings, form, venue streaks, special teams, shots, period goals, scorers, goalies, discipline, faceoffs, lineup diff, rest days and win probability. Historical depth features (all-time H2H, last meeting recap, season trajectory) exist in the codebase but are only used in the post-game view.

## Proposed additions

1. **Storylines card** (` Kommentatorns snackisar `)
   - A new top-of-briefing card that lists 3-5 bullet talking points.
   - Generated from existing data: current streaks, form contrast, special-teams edge, faceoff edge, last meeting outcome, all-time H2H dominance, milestone watch (if available).
   - Producers can override or add manual notes.

2. **Historical rivalry card**
   - Reuse the existing `getAllTimeHeadToHead` server function.
   - Show all-time record, meetings count, and home/away split between the two teams.

3. **Last meeting recap card**
   - Reuse the existing `getLastMeetingRecap` server function.
   - Show date, score, goal summary, shots and PIM from the most recent meeting.

4. **Season trajectory mini-cards**
   - Reuse the existing `getSeasonTrajectory` server function.
   - Show a small sparkline/line chart of each team's cumulative points per game over the season, plus league-average baseline.

5. **Milestone / manual nuggets**
   - Add a `story_nuggets` table with `id`, `team_name`, `type` (`milestone`, `returning_player`, `rivalry`, `manual`), `text`, `expires_at`, `created_by`, `created_at`.
   - Admin UI under `/admin/stories` to create, edit, expire and pin nuggets.
   - Nuggets appear in the Storylines card when they match one of the two teams and are not expired.

## External data (optional, gated by secrets)

- Add a generic `fetchExternalStoryContext` server helper that can call an external API for extra context (e.g. Elite Prospects player pages, local arena info, weather).
- The helper reads `STORY_API_URL` and `STORY_API_KEY` from secrets and is disabled when not configured, so the app keeps working on Swehockey data alone.

## Files to touch

- `src/lib/stats.functions.ts` — add `getStorylines`, `getHistoricalRivalry`, `getLastMeetingRecapForBriefing`, `getSeasonTrajectoryForBriefing` wrappers.
- `src/lib/stats.server.ts` — implement nugget generation logic and external-context fetcher.
- `src/components/dashboard/cards/storylines-card.tsx` — new card component.
- `src/components/dashboard/cards/historical-rivalry-card.tsx` — new card component.
- `src/components/dashboard/cards/last-meeting-recap-card.tsx` — new card component.
- `src/components/dashboard/cards/season-trajectory-mini-card.tsx` — new sparkline card.
- `src/components/dashboard/briefing-view.tsx` — insert new cards near the top of the grid.
- Supabase migration — create `story_nuggets` table with admin-only RLS.
- `src/routes/_authenticated/admin.stories.tsx` — admin curation page.
- `src/components/admin-nav.tsx` — add "Stories" link.

## Out of scope

- No changes to live play-by-play or TV rotation in this plan.
- No new scraping sources are required; Swehockey-derived data is the baseline.

## Success criteria

- The briefing dashboard shows the new cards for any matchup.
- Admins can create, edit and expire story nuggets.
- The app builds and passes `bun run typecheck`.
