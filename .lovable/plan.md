## Goal

At the top of `/admin/vmix`, automatically check if Grästorps IK has a home game today and prefill the form with that game's data. Add a manual override that lets you pick any date + any two teams (great for testing vMix against a past game), and clearly show which source is currently populating the form.

Nothing publishes automatically — this only fills the form fields. You still press **Publicera till vMix** to update the 4 JSON endpoints. That matches the current publish-first model and avoids accidental live changes.

## UX

New card at the top of the page, above "Matchinställningar":

```text
┌─ Datakälla ───────────────────────────────────────────────┐
│ [Badge: AUTO] Hemmamatch hittad: Grästorps IK vs X        │
│               (2026-07-03, Ishuset Grästorp)              │
│ Formuläret nedan är förifyllt från dagens schema.         │
│                                                            │
│ [ Manuell override ▾ ]  [ Uppdatera från schemat ]        │
└────────────────────────────────────────────────────────────┘
```

States for the badge/message:
- **AUTO – match hittad**: "Hemmamatch hittad: {home} vs {away} ({date})"
- **AUTO – ingen match**: "Ingen hemmamatch för Grästorps IK idag ({today})"
- **MANUELL**: "Manuell override aktiv – {home} vs {away} ({date})"
- **Loading**: "Hämtar dagens schema…"

Manuell override panel (expands inline in the same card) contains:
- Datum (shadcn date picker, defaults to today, allows past dates)
- Hemmalag (Select — full team list)
- Bortalag (Select — full team list, filtered to exclude home)
- Button: **Använd denna match**
- Button: **Avbryt**

Button: **Uppdatera från schemat** (visible when manual override is active) — re-runs auto detection and repopulates the form.

## Behavior

1. On mount, call `getTodaysMatchup` (already exists in `src/lib/stats.functions.ts`) with team = "Grästorps IK".
2. If a match is returned AND `homeTeam === "Grästorps IK"`, prefill the form (date, home, away) and call `fetchTeamRoster` for both teams to prefill lineups. Set source = `auto`.
3. If no home game today, leave the form empty, show the "Ingen hemmamatch idag" message. Home/away/date remain editable manually.
4. When user clicks **Använd denna match** in the override panel:
   - Set date/home/away from the picker
   - Call `fetchTeamRoster` for both teams to prefill lineups
   - Set source = `manual`
   - Show "MANUELL" badge
5. When user clicks **Uppdatera från schemat**: same as step 1–2, source resets to `auto`.
6. If an active publication already exists (existing `activeQuery` hydrate effect), that hydration still wins on first load and source is labelled `manual` (since it came from a previous manual publish) with a note "Formuläret återspeglar nuvarande LIVE-publicering". This keeps existing behavior intact.

The 4 JSON endpoints are only updated when the user presses the existing **Publicera till vMix** button. The badge on the publish bar continues to show LIVE/ingen-publicering as today.

## Technical

Files to change (frontend only):

- `src/routes/_authenticated/admin.vmix.tsx`
  - Import `getTodaysMatchup` from `@/lib/stats.functions`.
  - Add `sourceMode: "auto" | "manual" | "live-hydrated"` state and a `todaysMatchQuery` (react-query, `enabled: !!isAdmin`, no auto-refresh).
  - Add a new `<DataSourceCard />` component (in the same file, matching the existing local-component style) that renders the badge, message, and override controls.
  - Reuse the existing `prefillHome` / `prefillAway` mutations to load rosters after setting teams; extract a small `applyMatchup({date, home, away, source})` helper that sets state + triggers both roster fetches.
  - Only run the auto-hydrate effect once per admin session; skip auto-apply if `activeQuery.data` hydrated the form (mark as `live-hydrated`).

No server, database, or endpoint changes. `getSeasonSchedule` already supports past dates and is what powers `getTodaysMatchup`, so historical manual matchups Just Work.

## Answer to your question

Yes — with the manual override you can pick any past date and any two teams, prefill the form from their rosters, and then press **Publicera till vMix**. The 4 JSON feeds will then serve that historical matchup, which is exactly what you want for vMix GT Designer test runs. Press **Avpublicera** (or **Uppdatera från schemat** + Publicera) when you're done testing.
