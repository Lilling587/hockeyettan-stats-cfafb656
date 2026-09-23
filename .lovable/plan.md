# Målvaktsstatistik på Spelare-sidan

## Mål
På `/spelare` ska det gå att söka och sortera målvakter på SV%, GAA och SO — med kolumner som passar målvakter istället för mål/assist.

## Nuläge (verifierat)
- `fetchAllLeaguePlayers` i `src/lib/stats.server.ts` läser redan målvaktstabellen per lag men sparar bara namn och GP — SV% (cells[10]), GAA (cells[11]) och SO (cells[12]) finns i HTML men kastas.
- `src/routes/spelare.tsx` filtrerar bort alla målvakter (`position !== "G"`), så knappen "Målvakter" i position-filtret aldrig visar något.

## Ändringar

### Backend
1. `src/lib/stats.functions.ts` — utöka `LeaguePlayer`-typen med `savePct`, `gaa`, `shutouts` (number | null, default null).
2. `src/lib/stats.server.ts` — i målvakts-delen av `fetchAllLeaguePlayers`: tolka cells[10]/[11]/[12] och fyll i `savePct`, `gaa`, `shutouts` på raden (position "G").
3. Bumpa `CACHE_VERSION` så cachen inte serverar gamla rader utan målvaktsfälten.

### Frontend (`src/routes/spelare.tsx`)
4. Ta bort filtret som utesluter målvakter helt.
5. När position-filtret är "Målvakter":
   - Visa målvaktskolumner i tabellen: GP, SV%, GAA, SO (istället för G/A/P/PIM), både desktop-tabell och mobilvy.
   - Sorteringsknappar byts till SV% (högst först), GAA (lägst först), SO (flest först); standard = SV% med null längst ner (samma logik som Målvakter-kortet på startsidan).
   - Sökningen på namn/lag fungerar som idag.
6. För övriga positionsfilter (Alla/Forwards/Backar) är allt oförändrat — målvakter visas inte där.
7. `matchPosition` behålls men "all" visar bara utespelare (som idag); målvakter nås via "Målvakter"-filtret.
8. Lagra inget nytt i sessionStorage utöver befintliga fält (pos/sort sparas redan).

## Tekniska detaljer
- Målvaktstabellens kolumner: Rk, No, Name, GPT, GKD, GPI, MIP, GA, SVS, SOG, SVS%, GAA, SO, W, L — index 10/11/12 = SV%, GAA, SO (samma som befintlig parser i `fetchScoringPageData`).
- Sortering: SV% desc och SO desc med null sist; GAA asc med null sist.

## Verifiering
- `bun run typecheck` och befintliga tester.
- Manuell kontroll i webbläsaren: välj "Målvakter" på `/spelare`, verifiera kolumner, sortering och sök.
