# StandingsBriefingRow

Datakontrakt för en enskild rad i ligatabellen som parsas ur HTML-fallbacken
(`fetchStandingsFromHtml` i `src/lib/stats.server.ts`). Fälten mergas in i
`TeamBriefing` av fallback-passet i `buildBriefing`.

## Fält

| Fält          | Typ              | Beskrivning                                             | Källa (kolumn i standings-tabellen) |
| ------------- | ---------------- | ------------------------------------------------------- | ----------------------------------- |
| `position`    | `number \| null` | Ligaplacering (1-baserad).                              | Kol 0                               |
| `gamesPlayed` | `number \| null` | Antal spelade matcher denna säsong.                     | Kol 2                               |
| `points`      | `number \| null` | Ligapoäng.                                              | Kol 8                               |
| `goalsFor`    | `number \| null` | Gjorda mål (säsongstotal).                              | GF-kolumn                           |
| `goalsAgainst`| `number \| null` | Insläppta mål (säsongstotal).                           | GA-kolumn                           |
| `wins`        | `number \| null` | Vinster på ordinarie tid.                               | W-kolumn                            |
| `otWins`      | `number \| null` | Övertidsvinster (exkluderar straffar).                  | OTW-kolumn                          |
| `otLosses`    | `number \| null` | Övertidsförluster (exkluderar straffar).                | OTL-kolumn                          |
| `gwsw`        | `number \| null` | Straffläggningsvinster (Game-Winning Shots — Win).      | GWSW-kolumn                         |
| `gwsl`        | `number \| null` | Straffläggningsförluster (Game-Winning Shots — Loss).   | GWSL-kolumn                         |

Alla värden är nullbara. Parsingfel (saknade celler eller icke-numeriskt
innehåll) blir `null` istället för att kasta.

## Checklista när ett nytt fält läggs till

Håll dessa fem steg synkade — annars läcker fältet inte hela vägen ut till UI:

1. **Parsa** fältet i `fetchStandingsFromHtml`.
2. **Mergea** fältet i `apply()`-blocket i fallback-passet i `buildBriefing`.
3. **Registrera** fältet i:
   - `FieldKey`-unionen
   - `missingBefore()`
   - `standingsMissing()` (om avsaknad ska trigga en standings-fetch)
4. **Exponera** fältet på `TeamBriefing` i `src/lib/stats.functions.ts` och
   seeda det som `null` i `emptyTeam()` i `src/lib/stats.server.ts`.
5. **Bumpa** `CACHE_VERSION` så att cachade briefingar refreshas.

## Relaterade filer

- `src/lib/stats.server.ts` — typdefinition, parser, fallback-logik.
- `src/lib/stats.functions.ts` — `TeamBriefing` schema (client-safe).
