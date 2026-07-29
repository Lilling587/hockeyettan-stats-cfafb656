# Avsluta TypeScript strict mode-audit

## Nuvarande läge
- `strict: true` är redan på i `tsconfig.json`.
- `bun run typecheck` misslyckas just nu med **3 fel** i `src/lib/stats.server.ts` kring faceoff-typer (`teamFoWins`/`teamFoTotal` saknas vid uppbyggnad av `FaceoffsData`).
- Många `as`-castar finns kvar, särskilt i `src/lib/vmix.functions.ts` där publiseringsflödet castar Supabase-rader och JSONB-kolumner.
- `IMPROVEMENTS.md` noterar att "publishVmix Supabase cast remains".

## Mål
Få `bun run typecheck` helt grön, ta bort onödiga/riskabla `as`-castar, och införa en mekanism så att nya castar inte smyger in igen.

## Plan

### 1. Rätta befintliga typecheck-fel
**Fil:** `src/lib/stats.server.ts`
- Lägg till `teamFoWins` och `teamFoTotal` i returobjektet där `FaceoffsData` byggs upp (raderna som typecheckern pekar på).
- Säkerställ att `emptyTeam()` och `buildBriefing()` hanterar de nya fälten konsekvent.
- Verifiera med `bun run typecheck`.

### 2. Åtgärda publishVmix- och audit-log-castarna
**Fil:** `src/lib/vmix.functions.ts`
- Ersätt `(supabase as any).from("vmix_audit_log")...` och `(context.supabase as any).from("vmix_audit_log")...` med korrekt typad klientanvändning.
- Definiera ett typsäkert `AuditLogInsert`-objekt istället för att casta `details` fält för fält.
- Ersätt `inserted as unknown as Record<string, unknown>` och liknande efter `insert().select()` med korrekt returtyp från Supabase-klienten.

### 3. Rensa JSONB/Json-castar i publiseringsflödet
**Fil:** `src/lib/vmix.functions.ts`
- Inför små hjälptyper för `VmixPublicationInsert` / `VmixPublicationUpdate` så att `home_slots`, `away_slots`, `standings_json` kan skickas utan `as unknown as Json`.
- Gör samma sak för `updateActivePublication` och `restorePublication`.

### 4. Auditera övriga castar
**Filer:** `src/lib/stats.server.ts`, `src/lib/stats.functions.ts`, `src/lib/game-flow.server.ts`
- Behåll nödvändiga casts för externa API-svar (Firecrawl, Swehockey HTML) och felobjekt — dessa är ofrånkomliga.
- Ersätt `[] as ScheduleGame[]` och `{} as Record<string, SpecialTeamsEntry>` med explicita typdeklarationer (`const games: ScheduleGame[] = []`) där det är möjligt.
- Se över `(err as Error).message` — överväg att använda en liten `getErrorMessage`-hjälpare.

### 5. Lägg till typecheck i CI
**Fil:** `.github/workflows/ci.yml`
- Lägg till ett steg som kör `bun run typecheck` före `bun run build` så att typecheck-fel blockerar merge.

### 6. Dokumentera riktlinjer
**Fil:** `CLAUDE.md` (eller ny fil under `docs/`)
- Lägg till en kort punkt om att undvika `as`-castar för interna datastrukturer; motivera varje cast med kommentar.

## Verifiering
- `bun run typecheck` ska returnera 0 fel.
- `bun run build` ska gå igenom.
- `bun run test` ska fortsätta passera.
- Inga funktionella ändringar — endast typer och eventuellt små refaktoreringar av hur data byggs upp.

## Leverabler
- Uppdaterad `src/lib/stats.server.ts` (faceoff-typfixar)
- Uppdaterad `src/lib/vmix.functions.ts` (typsäker publish/audit/restore)
- Uppdaterad `.github/workflows/ci.yml` (typecheck-steg)
- Uppdaterad `CLAUDE.md` (riktlinje för casts)