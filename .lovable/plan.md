# Förbättringsplan för HockeyEttan Stats

Baserat på nuvarande läge (de flesta backlog-punkter klara, typcheck OK, säkerhetsfixar på plats) föreslår vi tre fokusområden: **producent-UX**, **sändningspålitlighet** och **backend-hälsa**. Varje område innehåller mätbara leverabler.

---

## 1. Frontend – producent- och kommentatorsupplevelse

### 1.1 Personligt dashboard (högst prioritet)
- Låt inloggade användare dölja/ordna om briefing-kort via drag-and-drop.
- Spara layouten i `localStorage` (och gärna i `notification_prefs` om vi vill ha den användarövergripande).
- Standardlayout oförändrad för nya användare.

### 1.2 Sök och filter i adminlistor
- Lägg till sök i `/admin/users`, `/admin/audit`, `/admin/auth-emails` och `/admin/logs`.
- Filter: status (pending/approved/rejected), roll (admin/användare), datumintervall.
- Bulkåtgärder: godkänn/neka flera användare samtidigt.

### 1.3 Kommentatorsläge – offline och print
- Cacha senaste laddade briefing i service workern så kommentatorsvyn fungerar om nätverket går ner under sändning.
- Lägg till en ren print-CSS för briefing-korten (dölj header, toggle-knappar, bakgrundsfärger).
- Visa en "Senast uppdaterad"-tidsstämpel per kort så kommentatorn vet vilken data som är aktuell.

### 1.4 Konsekventa tomma/fel-tillstånd
- Ersätt texten "Ingen data" med illustrerade/tomma tillståndskomponenter i alla kort.
- Gemensam `<ErrorState retry={...} />`-komponent som används över hela appen.

### 1.5 Tillgänglighet (a11y)
- ARIA-labels på alla ikonknappar i admin/vMix.
- Fokusindikatorer i slot-redigeraren.
- Se till att alla formulär har kopplade `<label>`-element.

---

## 2. Backend – pålitlighet, prestanda och övervakning

### 2.1 Distribuerad rate limiting (högst prioritet)
- Nuvarande rate limiter är in-memory per Worker-instans.
- Flytta till Supabase-backed lagring (t.ex. en `rate_limit_buckets`-tabell med RLS) så gränser gäller globalt även vid flera Worker-instanser.
- Behåll interna undantag för server-till-server-anrop.

### 2.2 Scrape-kö med retry och dead-letter
- Inför en `scrape_queue`-tabell (eller använd befintlig `pgmq`) för misslyckade scrapes.
- Automatisk retry med exponentiell backoff.
- Dead-letter-kö efter 3 försök, exponerad i `/admin/health`.

### 2.3 Datavalidering med Zod
- Definiera Zod-scheman för all extern data från `stats.swehockey.se` (standings, lineups, player stats, schedules).
- Kasta tydliga fel vid oväntat format istället för tysta `null`-värden.
- Logga schemafel till `error_log` med kontext.

### 2.4 Prestandaindex och query-optimering
- Lägg till index på ofta filtrerade kolumner: `vmix_publications.published_at`, `audit_events.created_at`, `scrape_metrics.fetched_at`, `error_log.created_at`.
- Granska långsamma queries via `/admin/usage` och Supabase slow-query-loggen.

### 2.5 Strukturerad loggning och larm
- Ersätt `console.warn`/`console.error` i serverfunktioner med ett enhetligt loggformat: `{source, level, message, context, route}`.
- Gruppera liknande fel i `/admin/logs` (t.ex. "Firecrawl timeout" – 12 st senaste timmen).
- Lägg till en "Larm"-sektion i `/admin/health`: rött om samma fel upprepas >5 gånger per timme.

---

## 3. Sändningsspecifika förbättringar

### 3.1 Offlinelagring av senaste briefing
- Service workern cache:ar `/` + senaste `/api/public/vmix/*`-anrop.
- Visar en "Offline – visar cache"-banner.
- Användbart om internet går ner i sändningsbussen.

### 3.2 Auto-detektering av Swehockey API-fel
- `/admin/health` jämför primära `vmix-new.hockeyettan.se` mot våra egna backup-endpoints.
- När primära API:et misslyckas 3 gånger i rad, visa tydlig rekommendation: "Byt till backup-domän" med klickbar knapp som kopierar backup-URL:en.

### 3.3 Utökad förberedelsekontroll
- Lägg till "Senaste scraping OK" och "Logotyper uppladdade för båda lagen" i readiness-kortet.
- Möjlighet att exportera en PDF/Screenshot av hela briefingvyn för producentens anteckningar.

### 3.4 Sändningstidslinje
- En ny tabell `broadcast_events` (eller återanvänd `vmix_audit_log`) loggar: puck drop, mål, periodslut, publicering, avpublicering.
- Visas i `/admin/vmix` som en tidslinje under pågående sändning.

---

## 4. Test och kvalitet

### 4.1 Utöka testtäckningen
- Idag finns endast ett test (`shot-timeline-card.test.tsx`).
- Lägg till tester för:
  - `form-card.tsx` – sortering och null-hantering.
  - `goalies-card.tsx` – SV%-sortering.
  - `venue-streak-card.tsx` – badge-rendering.
  - `vmix.functions.ts` – publish/unpublish logik med mockad Supabase.

### 4.2 CI-förbättringar
- Lägg till `bun run lint` och `bun run test` i `.github/workflows/ci.yml` (idag körs bara build + typecheck).
- Lägg till en byggvarning om `src/` är nyare än `dist/` vid produktionsbygge.

### 4.3 Strict TypeScript
- Åtgärda kvarvarande `as any`/`as never` (se IMPROVEMENTS.md punkt 16 – delvis klar).
- Aktivera `noImplicitAny` och `strictNullChecks` fullt ut om de inte redan är på.

---

## 5. Föreslagen prioritetsordning

| Fas | Leverabler | Varför först? |
|---|---|---|
| **Fas 1** | Distribuerad rate limiter, scrape-kö, Zod-validering | Påverkar driftstabilitet och kreditförbrukning direkt. |
| **Fas 2** | Personligt dashboard, sök/filter i admin, offline-cache | Mest synbara producent- och kommentatorförbättringar. |
| **Fas 3** | Index/perf, strukturerad loggning, larm | Gör appen lättare att skala och felsöka. |
| **Fas 4** | Sändningstidslinje, auto-failover, utökad readiness | Polish för broadcast-säsongen. |
| **Fas 5** | Testtäckning, strict TS, CI-lint/test | Långsiktig kodkvalitet. |

---

## Nästa steg

1. Godkänn planen.
2. Välj **fas 1** eller en specifik punkt att börja med.
3. Jag börjar implementera och uppdaterar `IMPROVEMENTS.md` med nya punkter.

Vill du att vi börjar med en specifik del, eller ska jag prioritera fas 1 (backend-stabilitet) först?