# Grästorps IK — Producent-statistik

A TanStack Start app that builds pre-game and post-game statistics briefings for Swedish ice hockey commentators covering **HockeyEttan Södra**. It scrapes raw data from `stats.swehockey.se`, enriches it with AI, caches results, and exposes a clean dashboard for producers.

## Features

- **Matchup briefing** — form, league position, GP, top scorers, goalies, PP/PK with opportunities, faceoffs, shots, H2H, venue splits, lineup diff, win probability, and more.
- **Sticky navigation** and **scroll memory** — briefing page remembers scroll position when navigating away and back.
- **Stream Deck / Bitfocus Companion integration** — URL anchors for every briefing card (`public/briefing-anchors.json`, `public/companion-shortcuts.json`).
- **vMix backup API** — publish lineup and standings to `/api/public/vmix/*`; switch domain in vMix if the official Swehockey API fails.
- **Auto-fill today’s opponent** when the home team has a scheduled game.
- **Favorite team** support persisted in `localStorage`.
- **Compare teams** side-by-side on `/compare`.
- **Auth & notifications** — users can sign in and manage email notification preferences on `/notifications`.
- **Admin panel** — user management, vMix lineup editor, asset storage, email log, system health, audit log.
- **Season detection** — background scan for new seasons/competition IDs with admin confirmation.
- **Email webhooks** — `/api/public/hooks/pregame-emails` and `/api/public/hooks/postgame-emails` for external scheduling.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start v1, React 19, TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4, shadcn/ui, CSS custom properties |
| Backend / Auth | Lovable Cloud (Supabase) |
| Data scraping | stats.swehockey.se via Firecrawl |
| AI | Lovable AI Gateway (`google/gemini-2.5-flash`) |
| Email | Resend |
| Package manager | Bun |

## Prerequisites

- [Bun](https://bun.sh/) 1.2 or later
- A Lovable Cloud project with the migrations in `supabase/migrations/` applied
- External service keys for the features you plan to use:
  - Firecrawl API key (data scraping)
  - Lovable AI Gateway key (AI enrichment)
  - Resend API key (email notifications)

## Environment Variables

Create a `.env` file in the project root with the variables below. Public values that the browser needs must be prefixed with `VITE_`.

```bash
# Supabase / Lovable Cloud — public client values
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id

# Supabase — server-only
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# External integrations
FIRECRAWL_API_KEY=your-firecrawl-api-key
LOVABLE_API_KEY=your-lovable-ai-gateway-key
RESEND_API_KEY=your-resend-api-key
```

> Never commit real secrets. The public `VITE_*` values are shipped to the browser, so keep them limited to non-sensitive keys.

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Start the Vite development server |
| `bun run build` | Production build (cleans stale output first) |
| `bun run build:dev` | Development build (cleans stale output first) |
| `bun run build:verify` | Verify that `dist/` is newer than `src/` |
| `bun run clean` | Remove generated directories and caches |
| `bun run preview` | Preview the last production build locally |
| `bun run lint` | Run ESLint |
| `bun run format` | Format the codebase with Prettier |

## Project Structure


```text
.
├── scripts/
│   ├── clean.mjs          # Cross-platform clean helper
│   └── verify-build.mjs   # Detects stale build output
├── src/
│   ├── components/        # Reusable UI components
│   ├── hooks/             # React hooks
│   ├── integrations/      # Lovable Cloud / Supabase integrations
│   ├── lib/               # Server functions, AI gateway, utilities
│   ├── routes/            # TanStack file-based routes
│   │   ├── __root.tsx     # Root layout and shell
│   │   ├── index.tsx      # Home / producer dashboard
│   │   ├── compare.tsx    # Side-by-side team comparison
│   │   ├── auth.tsx       # Sign-in / sign-up
│   │   ├── _authenticated/
│   │   │   ├── route.tsx  # Auth-guarded layout
│   │   │   └── notifications.tsx
│   │   └── api/public/hooks/
│   │       ├── pregame-emails.ts
│   │       └── postgame-emails.ts
│   ├── router.tsx         # Router factory
│   ├── server.ts          # SSR Worker entry
│   ├── start.ts           # TanStack Start instance + middleware
│   └── styles.css         # Tailwind theme tokens
├── supabase/migrations/   # Database schema
├── vite.config.ts
├── package.json
└── tsconfig.json
```

## Database

Migrations in `supabase/migrations/` create the following tables:

- `vmix_publications` — published lineup + standings JSONB (Realtime enabled)
- `vmix_lineup_presets` — saved lineup templates
- `vmix_audit_log` — audit trail of all publish actions
- `team_logo_codes` — team name → logo code mapping
- `team_logos` — briefing logo URL cache (from Supabase Storage)
- `season_detections` — pending/confirmed new season IDs
- `season_overrides` — confirmed competition ID overrides (takes precedence over seasons.config.ts)
- `season_check_meta` — last scan status and timing
- `notification_prefs` — per-user email notification settings (RLS-protected)
- `profiles` — user approval status (approved/pending/denied)
- `email_send_log` — manually triggered auth emails log

Apply these through your Lovable Cloud backend before running the app.

## Development Notes

- This project uses **file-based routing**. Do not create a `src/pages/` directory or Next.js/Remix-style layouts; the router is generated from `src/routes/`.
- Server functions live in `src/lib/*.functions.ts` and use TanStack `createServerFn`.
- Routes that require an authenticated user are nested under `src/routes/_authenticated/`.
- Public webhook endpoints live under `src/routes/api/public/`.
- `src/start.ts` registers `attachSupabaseAuth`; removing it will break authenticated server functions.
- The production target is a serverless Worker (Cloudflare). Avoid Node-only packages that rely on `child_process`, native binaries, or filesystem watchers.
- Datakontrakt för standings-fallbacken (`StandingsBriefingRow`) dokumenteras i [`docs/standings-briefing-row.md`](docs/standings-briefing-row.md) — läs den innan du lägger till nya standings-fält.


## Troubleshooting

### iPhone preview fails while desktop works

If the preview loads in a desktop browser but not on an iPhone, check `vite.config.ts` for hard-coded HMR WebSocket overrides:

```ts
server: {
  hmr: {
    protocol: "wss",
    clientPort: 443,
  },
}
```

**Why this is a problem:** The Lovable preview is served through an HTTPS proxy, but the sandbox preset already chooses the right WebSocket protocol (`ws` or `wss`) and port based on the current page protocol. Forcing `protocol: "wss"` and `clientPort: 443` can break the HMR connection on iOS because the proxy's routing between the browser and the sandbox is different from a local `localhost` setup. Desktop browsers may tolerate the mismatch; Safari/WebKit on iOS often refuses it and the preview stays blank or reloads.

**Recommended fix:** Remove `protocol` and `clientPort` from `server.hmr` and let the preset handle them. Keep only timing-related options, e.g.:

```ts
server: {
  hmr: {
    timeout: 120_000,
    overlay: true,
  },
}
```

**How to verify:**
1. Save the change and wait for the dev server to restart.
2. Open the preview link in Safari on an iPhone.
3. Check the preview for at least 15–20 seconds — a broken HMR handshake usually causes a full-page reload or blank screen within the first 10–15 seconds.
4. On a Mac, open Safari's Develop menu and inspect the connected iPhone. Look at the Console/Network tab for repeated WebSocket errors or `vite` disconnect/reload messages.

## Deployment

The app is built and deployed through Lovable. If you deploy the build artifact elsewhere, make sure:

- All environment variables above are available to the runtime.
- Supabase migrations are applied and RLS policies are active.
- `vite.config.ts` does **not** set `ssr.external` for the Worker environment.

## License

Private — not licensed for public use.
