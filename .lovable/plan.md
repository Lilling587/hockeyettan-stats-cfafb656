# Storylines card — "Kommentatorns snackisar"

## Goal
A single card at the top of the match briefing that turns the numbers already on the page into 3-6 ready-to-say talking points for the commentators.

## Where it goes
Directly under the two team headers in the briefing, above "Inbördes möten", with anchor id `storylines` so it can be linked and jumped to like the other sections.

## What it says
Talking points are derived from data the briefing already loads — no new scraping, no database table, no external API. Each point is one short Swedish sentence with the key number highlighted.

Rules that generate points, in priority order:

1. **Streak** — a team on 3+ straight wins or losses ("Grästorps IK har vunnit fyra raka.").
2. **Form contrast** — clear gap in points per game over the last five ("Hemmalaget tar 2,4 poäng per match senaste fem, gästerna 0,8.").
3. **Table gap** — difference in standings position and points.
4. **Special-teams edge** — the bigger of the PP or PK difference when it exceeds a few percentage points.
5. **Faceoff edge** — team FO% difference above a threshold, with the strongest individual faceoff taker named.
6. **Goalie form** — best save percentage on each side when the difference is meaningful.
7. **Venue** — home team's home record or away team's road record when it is notably strong or weak.
8. **Rest** — days since last game when one side has a clear advantage.
9. **Discipline** — PIM per game gap, naming the most-penalized player.
10. **Head-to-head** — this season's meetings between the teams and how they went.
11. **Period tendency** — each side's strongest scoring period when it stands out.

The card shows the highest-priority points that have data, capped at six, so it never looks thin or overwhelming. If nothing qualifies, it shows a short "Inga tydliga snackisar just nu" message rather than an empty card.

## Producer controls
- A copy button that puts all visible points on the clipboard as plain bullets, so they can be pasted into a rundown or read directly.
- Points are also appended to the existing text and markdown exports, so "Kopiera som text (TV-mall)" and "Kopiera som markdown" include them.

## Technical notes

- New `src/lib/storylines.ts` — pure functions that take the `Briefing` object and return `{ id, priority, text }[]`. No server calls; everything comes from data already in `Briefing` and from helpers in `src/lib/dashboard-utils.ts` (`currentStreak`, `lastFivePpg`, `venueWinRate`, `daysSinceLast`, `strongestPeriod`).
- New `src/components/dashboard/cards/storylines-card.tsx` — renders the list, uses existing Card/Badge/Button components and semantic tokens only.
- `src/components/dashboard/briefing-view.tsx` — render the card in a `<div id="storylines">` after the team headers.
- `src/lib/briefing-export.ts` — add the points to `briefingToTvText` and `briefingToMarkdown`.
- `src/lib/briefing-anchors.ts` and `public/briefing-anchors.json` — add the `storylines` anchor so Companion can jump to it.
- New unit test `src/lib/__tests__/storylines.test.ts` covering the streak, special-teams and empty-data cases.

## Out of scope
- No `story_nuggets` table or admin curation page (that was item 5 of the earlier list).
- No external APIs, no AI-generated prose — deterministic rules only.
- No TV-mode slide for now.

## Success criteria
- The card appears on any matchup briefing with relevant points.
- Copy button and both existing exports include the points.
- Typecheck passes and the new unit test is green.
