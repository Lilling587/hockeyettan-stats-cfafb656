# Minska credit-användning för Lovable Cloud

Baserat på tidigare kartläggning är de största drivarna: admin health-polling, vMix endpoints som pollas, `pg_cron`-jobb (särskilt 5-sekunders email queue processor), och heartbeat/error-loggskrivningar. Nedan är åtgärder ordnade från störst till minst effekt.

## 1. Bromsa admin health-pollingen (störst effekt)

I `src/routes/_authenticated/admin.health.tsx` körs tre queries (`scrape-health`, `supabase-health`, `vmix-health`) på samma intervall, default 60 s, men valbart ner till 15 s. Varje tick = 3 server-fn-anrop + DB-läsningar + eventuell heartbeat-INSERT i `error_log`.

Ändringar:

- Höj default till **300 s** (5 min) istället för 60 s.
- Ta bort 15 s och 30 s som val – lämna 60 s / 5 min / 15 min.
- Pausa refetch när fliken inte är synlig: sätt `refetchIntervalInBackground: false` på alla tre queries.
- Endast pinga vMix-endpoints när kortet är i viewport (IntersectionObserver) eller kräv manuell "Kontrollera nu".

## 2. Gör email-queue processorn on-demand istället för var 5:e sekund

`process-email-queue` schemaläggs var 5:e sekund = 17 280 körningar/dygn även när kön är tom. Enligt `email-infrastructure-guide` är on-demand-schemaläggning stödd: triggers på kötabellerna schemalägger jobbet när ett mail läggs in och avschemalägger sig själv när båda köerna är tomma.

Åtgärd: verifiera att on-demand wake-triggers är aktiva; om jobbet ligger kvar statiskt var 5:e sekund, kör `email_domain--setup_email_infra` igen så det byggs om till on-demand-mönstret.

## 3. Sänk frekvensen på pg_cron email-jobben (om acceptabelt)

Nuvarande: pregame 11:00 UTC dagligen, postgame 21:00 UTC dagligen, weekly-digest 07:00 UTC dagligen. Om det inte finns match varje dag kan pregame/postgame ändras till att köra endast på matchdagar (t.ex. gatea internt i endpointen på "finns match idag" innan queue-arbete). Det sparar inte cron-triggers men eliminerar dyra queries/inserts på tomma dagar.

## 4. Minska heartbeat-loggningen

`logVmixHeartbeatTransition` skriver till `error_log` vid varje grön↔röd övergång. Kombinerat med tät polling kan detta bli många skrivningar om vMix "flappar". Åtgärder:

- Kräv N stabila fel i rad (t.ex. 2) innan tillstånd byts – undviker skrivning vid enstaka timeouts.
- Behåll skrivningen men se till att den bara körs efter #1 ovan (5 min polling ⇒ max 288 potentiella transitions/dygn istället för 5 760 vid 15 s).

## 5. Cachea vMix-endpoint-läsningar

`admin/vmix`-sidan och externa vMix-anrop läser `vmix_publications`, `cached_briefings` och `team_logos` ofta. Lägg till `staleTime` (t.ex. 60 s) på TanStack Query-läsningarna i admin-vyerna så samma användare inte återhämtar samma data flera gånger vid navigering.

## 6. Storage och publika listningar

Publika bucket-listningar är avstängda (bra). Kontrollera att `vmix-assets`-buckets logotypanrop cachas i browser (via `use-team-logos.ts` – redan localStorage-cachat med `lovable.teamlogos.v2`). Ingen extra åtgärd förutom att låta cachen leva längre om möjligt.

## Föreslagen ordning

1. Ändra health-page polling (fil: `src/routes/_authenticated/admin.health.tsx`).
2. Kör `email_domain--setup_email_infra` igen för att säkerställa on-demand queue processor.
3. Lägg debounce (2 misslyckade i rad) i vMix heartbeat-transition-logiken.
4. Lägg `staleTime` på admin-queries där lämpligt.
5. (Valfritt) Gate pregame/postgame-endpoints på "match idag".

## Tekniska detaljer

- Alla ändringar är rent frontend + endpoint-nivå – inga schemaändringar.
- Ingen befintlig data påverkas.
- pg_cron-listning görs via `supabase--read_query` mot `cron.job` för att bekräfta att email-processorn är on-demand.

Vill du att jag kör hela listan, eller bara #1 + #2 som ger absolut störst effekt med minst risk?

Kör hela listan

&nbsp;