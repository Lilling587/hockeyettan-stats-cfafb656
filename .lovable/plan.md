# Åtkomstkontroll och användningsinsyn

## Nuvarande läge
- Hela startsidan (`/`) och all matchstatistik är **helt publik** – ingen inloggning krävs.
- Endast admin-sidor (`/admin/*`, `/notifications`, `/connect`) ligger bakom inloggning.
- Det finns en `admin`-roll, men ingen generell "godkänd användare"-status.
- Det finns ingen logg över vilka som besöker eller använder appen.

## Mål
1. Behåll en **publik landningssida** med grundläggande info.
2. Kräv **inloggning för att se matchstatistik/briefing**.
3. Nya konton måste **godkännas av en admin** innan de får åtkomst.
4. Admins ska kunna **se vem som använder appen** via en aktivitetslogg.

## Plan

### 1. Databasändringar
Skapa två nya tabeller:

- **`public.profiles`**
  - `id uuid primary key` (kopplas till `auth.users(id)`)
  - `email text`
  - `approval_status text` (`pending` / `approved` / `rejected`)
  - `created_at`, `updated_at`
  - RLS-policyer så att användare ser sin egen profil och admins ser alla.

- **`public.audit_events`**
  - `id uuid primary key`
  - `user_id uuid nullable` (NULL för ej inloggade publika besök om vi loggar dem)
  - `action text` (t.ex. `login`, `view_briefing`, `publish_vmix`, `signup`, `approved`)
  - `metadata jsonb nullable`
  - `ip_address text nullable`
  - `created_at`
  - RLS-policyer så att endast admins kan läsa.

### 2. Godkännandeflöde för nya användare
- Vid registrering skapas användaren i auth och en profil med `approval_status = 'pending'`.
- `_authenticated`-layouten uppdateras så att den kontrollerar både inloggning **och** att profilen är `approved`.
- Om inloggad men inte godkänd: visa ett "väntar på godkännande"-tillstånd.

### 3. Admin-gränssnitt
- Utöka `/admin/users` så att den visar:
  - Lista över användare och deras godkännandestatus.
  - Knappar för **Godkänn** / **Neka** / **Återkalla**.
  - Senaste inloggning och registreringsdatum.
- Lägg till en ny `/admin/audit`-sida som visar:
  - Filtrerbar lista över `audit_events`.
  - Vem som gjorde vad och när.

### 4. Aktivitetsloggning
- Skapa serverfunktioner för att skriva till `audit_events`.
- Logga automatiskt vid:
  - Inloggning / utloggning
  - Ny registrering
  - Admin godkänner/nekar användare
  - Ladda briefing
  - Publicera till vMix
  - Ändra notifikationsinställningar

### 5. Publik landningssida
- Behåll `/` som en enkel publik sida med kort beskrivning och en "Logga in"-knapp.
- Flytta själva dashboard/statistikvyn till ett autentiserat läge (t.ex. `/_authenticated/dashboard` eller behåll `/` men kräv inloggning där).
- Se till att `/auth` fortfarande hanterar inloggning/registrering.

### 6. Säkerhet och RLS
- Alla nya tabeller får `GRANT` och RLS aktiverat.
- Ingen icke-admin kan läsa andra användares profiler eller audit-events.
- Service-role-användning begränsas till admin-funktioner.

## Vad du får
- Kontroll över vilka som kan se matchstatistiken.
- En tydlig kö av nya användare som väntar på godkännande.
- En fullständig logg över vem som loggar in, vilka briefings som laddas och vilka vMix-publiceringar som görs.
- En fortsatt publik landningssida så att obehöriga kan se att appen finns.

## Teknisk omfattning
- 1 migration (`profiles` + `audit_events` + uppdaterade policies).
- Uppdatering av `_authenticated/route.tsx` för godkännandekoll.
- Uppdatering av `/auth` för att skapa pending-profil vid registrering.
- Uppdatering av `/admin/users` med godkännande-UI.
- Ny `/admin/audit`-sida.
- Nya serverfunktioner för loggning och användarhantering.
- Eventuellt en ny publik landningssida om vi flyttar dashboard.