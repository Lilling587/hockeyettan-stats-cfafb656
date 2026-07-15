import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_SEASON, getSeason } from "./seasons.config";

type Json = Database["public"]["Tables"]["cached_briefings"]["Row"]["payload"];
type StandingsJson = Json;
export type RosterPlayer = {
  name: string;
  number: number | string;
  position: string | null;
};
export type SlotPlayer = {
  name: string;
  number: number | string;
} | null;

export const SLOT_KEYS = [
  "GK1", "GK2",
  "LD1", "LD2", "LD3", "LD4", "LD5",
  "RD1", "RD2", "RD3", "RD4", "RD5",
  "XD1", "XD2", "XD3", "XD4", "XD5",
  "LW1", "LW2", "LW3", "LW4", "LW5",
  "C1",  "C2",  "C3",  "C4",  "C5",
  "RW1", "RW2", "RW3", "RW4", "RW5",
] as const;

export type SlotKey = (typeof SLOT_KEYS)[number];

export type VmixLineupSlots = {
  team: string;
  teamCode: string;
} & { [K in SlotKey]: SlotPlayer };

export function emptySlots(team: string, teamCode: string): VmixLineupSlots {
  const base: Record<string, SlotPlayer | string> = { team, teamCode };
  for (const k of SLOT_KEYS) base[k] = null;
  return base as VmixLineupSlots;
}

const SlotPlayerSchema = z
  .object({
    name: z.string(),
    number: z.union([z.number(), z.string()]),
  })
  .nullable();

const SlotsSchema = z.object({
  team: z.string(),
  teamCode: z.string(),
  ...Object.fromEntries(SLOT_KEYS.map((k) => [k, SlotPlayerSchema])),
} as Record<string, z.ZodTypeAny>) as unknown as z.ZodType<VmixLineupSlots>;

export type VmixPublicationRow = {
  id: string;
  gameDate: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string;
  awayTeamCode: string;
  venue: string | null;
  standings: StandingsJson;
  homeSlots: VmixLineupSlots;
  awaySlots: VmixLineupSlots;
  notes: string | null;
  isActive: boolean;
  publishedAt: string;
  updatedAt: string;
};
/** Throw if a Supabase operation returned an error. */
function throwIfSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
async function assertAdmin(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  throwIfSupabaseError(error);
  if (!data) throw new Error("Forbidden: admin only");
}

function normalizeSlots(raw: unknown, team: string, teamCode: string): VmixLineupSlots {
  const base = emptySlots(team, teamCode);
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Record<string, unknown>;
  if (typeof src.team === "string" && src.team) base.team = src.team;
  if (typeof src.teamCode === "string") base.teamCode = src.teamCode;
  for (const k of SLOT_KEYS) {
    const v = src[k];
    if (v && typeof v === "object" && "name" in (v as object)) {
      const p = v as { name?: unknown; number?: unknown };
      const name = typeof p.name === "string" ? p.name : "";
      const number =
        typeof p.number === "number" || typeof p.number === "string"
          ? p.number
          : "";
      base[k] = name ? { name, number } : null;
    } else {
      base[k] = null;
    }
  }
  return base;
}

function mapRow(row: Record<string, unknown>): VmixPublicationRow {
  const homeTeam = String(row.home_team);
  const awayTeam = String(row.away_team);
  const homeCode = String(row.home_team_code ?? "");
  const awayCode = String(row.away_team_code ?? "");
  return {
    id: String(row.id),
    gameDate: row.game_date == null ? null : String(row.game_date),
    homeTeam,
    awayTeam,
    homeTeamCode: homeCode,
    awayTeamCode: awayCode,
    venue: (row.venue as string | null) ?? null,
    standings: (row.standings_json as StandingsJson) ?? [],
    homeSlots: normalizeSlots(row.home_slots, homeTeam, homeCode),
    awaySlots: normalizeSlots(row.away_slots, awayTeam, awayCode),
    notes: (row.notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    publishedAt: String(row.published_at),
    updatedAt: String(row.updated_at),
};
}

/** Write a non-blocking audit log entry. Never throws — failures are silently ignored. */
async function logAuditEvent(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("vmix_audit_log").insert({
      action,
      publication_id: (details?.publicationId as string | null) ?? null,
      home_team: (details?.homeTeam as string | null) ?? null,
      away_team: (details?.awayTeam as string | null) ?? null,
      performed_by: userId,
      details: details ?? null,
    });
  } catch {
    // Non-blocking — audit failures never break the main operation.
  }
}

// ---- Active publication cache ----
// Reduces Supabase queries during broadcast. vMix polls every 5–15s per
// endpoint; without caching that's 4–12+ queries/min. With a 10s TTL the
// database sees at most ~6 queries/min regardless of polling frequency.
let _pubCache: { data: VmixPublicationRow | null; ts: number } | null = null;
const PUB_CACHE_TTL_MS = 30_000;

async function fetchActivePublicationFresh(): Promise<VmixPublicationRow | null> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client
    .from("vmix_publications")
    .select("*")
    .eq("is_active", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(error);
  const result = data ? mapRow(data as Record<string, unknown>) : null;
 _pubCache = { data: result, ts: Date.now() };
  return result;
}

export type TodayGame = {
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
  status: string;
};

/** Fetch today's live results from the swehockey live page. */
export async function fetchTodaysGames(): Promise<TodayGame[]> {
  const { scrapeLiveGames } = await import("./vmix.server");
  return scrapeLiveGames(DEFAULT_SEASON.competitionId).catch(() => []);
}

export type PlayerStats = {
  name: string;
  team: string;
  position: string;
  gamesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  points: number | null;
};

/** Fetch season stats for a single player by name (LASTNAME, FIRSTNAME format). */
export async function fetchPlayerStats(playerName: string): Promise<PlayerStats | null> {
  const { fetchAllLeaguePlayers } = await import("./stats.server");
  const players = await fetchAllLeaguePlayers(DEFAULT_SEASON);
  const normalized = playerName.trim().toUpperCase();
  const found = players.find((p) => p.name.toUpperCase() === normalized);
  if (!found) return null;
  return {
    name: found.name,
    team: found.team,
    position: found.position,
    gamesPlayed: found.gamesPlayed,
    goals: found.goals,
    assists: found.assists,
    points: found.points,
  };
}

/**
 * Anyone (including anon vMix pollers) can read the active publication.
 * Uses a 10-second in-memory cache to reduce database queries during
 * broadcast polling.
 */
export const getActivePublication = createServerFn({ method: "GET" }).handler(
  async (): Promise<VmixPublicationRow | null> => {
    if (_pubCache && Date.now() - _pubCache.ts < PUB_CACHE_TTL_MS) {
      return _pubCache.data;
    }
    return fetchActivePublicationFresh();
  },
);


/**
 * Prefill a team lineup from the swehockey roster page.
 */
export const fetchTeamRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ team: z.string().min(1), season: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RosterPlayer[]> => {
    await assertAdmin(context);
    const season = getSeason(data.season) ?? DEFAULT_SEASON;
    const { scrapeTeamRoster } = await import("./vmix.server");
    return scrapeTeamRoster(data.team, season);
  });

/**
 * Publish (or re-publish) a slot-based lineup snapshot.
 */
export const publishVmix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        gameDate: z
          .union([z.string(), z.null()])
          .optional()
          .transform((v) => (v == null || v === "" ? null : v))
          .refine((v) => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
            message: "gameDate must be YYYY-MM-DD or null",
          }),
        homeTeam: z.string().min(1),
        awayTeam: z.string().min(1),
        homeTeamCode: z.string().default(""),
        awayTeamCode: z.string().default(""),
        venue: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        season: z.string().optional(),
        homeSlots: SlotsSchema,
        awaySlots: SlotsSchema,
      })
      .parse(input),
  )
 .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Server-side safety guards — prevents publishing invalid data
    // even if the client-side warnings are somehow bypassed.
    const homeFilled = SLOT_KEYS.filter((k) => !!data.homeSlots[k]?.name).length;
    if (homeFilled === 0)
      throw new Error("Hemmalag-lineup är tom – lägg till minst en spelare.");
    if (!data.homeSlots.teamCode)
      throw new Error("Logotypkod saknas för hemmalaget.");
    if (!data.awaySlots.teamCode)
      throw new Error("Logotypkod saknas för bortalaget.");

    const season = getSeason(data.season) ?? DEFAULT_SEASON;
    const { fetchFullStandings } = await import("./stats.server");
    const standings = await fetchFullStandings(season).catch(() => []);

    // Guard: if we got some data but suspiciously few teams, the scrape
    // likely returned partial HTML (swehockey mid-update on a busy game day).
    // Block the publish rather than serve a corrupt standings table.
    if (standings.length > 0 && standings.length < 8) {
      throw new Error(
        `Tabellen verkar ofullständig – ${standings.length} lag hittades (normalt 14). Försök publicera igen om en stund.`,
      );
    }

    // Enrich standings with logo codes for the standings vMix endpoint.
    const { data: codeRows } = await context.supabase
      .from("team_logo_codes")
      .select("team_name, logo_code");
    const codesLookup: Record<string, string> = {};
    for (const c of codeRows ?? []) {
      codesLookup[String(c.team_name)] = String(c.logo_code);
    }
    const enrichedStandings = standings.map((row) => ({
      ...row,
      logoCode: codesLookup[row.team] ?? "",
    }));

    const { error: deactErr } = await context.supabase
      .from("vmix_publications")
      .update({ is_active: false })
      .eq("is_active", true);
  throwIfSupabaseError(deactErr);

    const insertPayload: Database["public"]["Tables"]["vmix_publications"]["Insert"] = {
      game_date: data.gameDate ?? null,
      home_team: data.homeTeam,
      away_team: data.awayTeam,
      home_team_code: data.homeTeamCode,
      away_team_code: data.awayTeamCode,
      venue: data.venue ?? null,
      notes: data.notes ?? null,
     standings_json: enrichedStandings as unknown as Json,
      home_slots: data.homeSlots as unknown as Json,
      away_slots: data.awaySlots as unknown as Json,
      published_by: context.userId,
      is_active: true,
      published_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await context.supabase
      .from("vmix_publications")
      .insert(insertPayload)
      .select("*")
      .single();
    throwIfSupabaseError(error);
    _pubCache = null; // Invalidate cache so endpoints serve fresh data.
    const pub = mapRow(inserted as unknown as Record<string, unknown>);
    await logAuditEvent(context.supabase, context.userId, "publish", {
      publicationId: pub.id,
      homeTeam: pub.homeTeam,
      awayTeam: pub.awayTeam,
      homePlayers: homeFilled,
      awayPlayers: SLOT_KEYS.filter((k) => !!data.awaySlots[k]?.name).length,
    });
    return pub;

  });

export const unpublishVmix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("vmix_publications")
      .update({ is_active: false })
      .eq("is_active", true);
   throwIfSupabaseError(error);
        _pubCache = null; // Invalidate cache so endpoints serve fresh data.
    await logAuditEvent(context.supabase, context.userId, "unpublish");
    return { ok: true };

  });

/**
 * Refresh only the standings_json of the active publication without
 * touching lineup slots. Useful when another Södra game finishes
 * before puck drop and the table changes.
 */
export const refreshStandings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const active = await fetchActivePublicationFresh();
    if (!active) throw new Error("Ingen aktiv publicering att uppdatera.");

    const { fetchFullStandings } = await import("./stats.server");
    const standings = await fetchFullStandings(DEFAULT_SEASON).catch(() => []);

    if (standings.length > 0 && standings.length < 8) {
      throw new Error(
        `Tabellen verkar ofullständig – ${standings.length} lag hittades. Försök igen om en stund.`,
      );
    }

    const { data: codeRows } = await context.supabase
      .from("team_logo_codes")
      .select("team_name, logo_code");
    const codesLookup: Record<string, string> = {};
    for (const c of codeRows ?? []) {
      codesLookup[String(c.team_name)] = String(c.logo_code);
    }
    const enrichedStandings = standings.map((row) => ({
      ...row,
      logoCode: codesLookup[row.team] ?? "",
    }));

    const { error } = await context.supabase
      .from("vmix_publications")
      .update({
        standings_json: enrichedStandings as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);
    throwIfSupabaseError(error);
    _pubCache = null;
    await logAuditEvent(context.supabase, context.userId, "refresh_standings", {
      publicationId: active.id,
      teamsUpdated: enrichedStandings.length,
    });
    return { ok: true, teamsUpdated: enrichedStandings.length };
  });

// ---------- vMix settings ----------

export type VmixSettings = {
  asset_base_url: string;
  club_id: string;
  lineup_version: string;
};

const SETTING_DEFAULTS: VmixSettings = {
  asset_base_url: "",
  club_id: "570",
  lineup_version: "0",
};

export async function readVmixSettings(): Promise<VmixSettings> {
  return { ...SETTING_DEFAULTS };
}
// ---------- Publication history ----------

export const getPublicationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VmixPublicationRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("vmix_publications")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(5);
  throwIfSupabaseError(error);
    return (data ?? []).map((r: Record<string, unknown>) => mapRow(r));
  });

export const restorePublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Deactivate all active publications.
    const { error: deactErr } = await context.supabase
      .from("vmix_publications")
      .update({ is_active: false })
      .eq("is_active", true);
   throwIfSupabaseError(deactErr);
    // Reactivate the target publication.
    const { error: actErr } = await context.supabase
      .from("vmix_publications")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", data.id);
        throwIfSupabaseError(actErr);
    _pubCache = null; // Invalidate cache so endpoints serve fresh data.
    await logAuditEvent(context.supabase, context.userId, "restore", {
      publicationId: data.id,
    });
    return { ok: true };

  });
// ---------- Audit log ----------

export type AuditLogRow = {
  id: string;
  action: string;
  publicationId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  performedBy: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditLogRow[]> => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from("vmix_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    throwIfSupabaseError(error);
    return (data ?? []).map((r: Record<string, unknown>): AuditLogRow => ({
      id: String(r.id),
      action: String(r.action),
      publicationId: r.publication_id ? String(r.publication_id) : null,
      homeTeam: r.home_team ? String(r.home_team) : null,
      awayTeam: r.away_team ? String(r.away_team) : null,
      performedBy: r.performed_by ? String(r.performed_by) : null,
      details: (r.details as Record<string, unknown> | null) ?? null,
      createdAt: String(r.created_at),
    }));
  });

// ---------- Lineup presets ----------

export type LineupPreset = {
  id: number;
  label: string;
  homeTeam: string;
  awayTeam: string;
  homeSlots: VmixLineupSlots;
  awaySlots: VmixLineupSlots;
  createdAt: string;
};

export const listLineupPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LineupPreset[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("vmix_lineup_presets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    throwIfSupabaseError(error);
    return (data ?? []).map((r: Record<string, unknown>): LineupPreset => ({
      id: Number(r.id),
      label: String(r.label),
      homeTeam: String(r.home_team),
      awayTeam: String(r.away_team),
      homeSlots: r.home_slots as VmixLineupSlots,
      awaySlots: r.away_slots as VmixLineupSlots,
      createdAt: String(r.created_at),
    }));
  });

export const saveLineupPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        label: z.string().min(1),
        homeTeam: z.string().min(1),
        awayTeam: z.string().min(1),
        homeSlots: SlotsSchema,
        awaySlots: SlotsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("vmix_lineup_presets")
      .insert({
        label: data.label,
        home_team: data.homeTeam,
        away_team: data.awayTeam,
        home_slots: data.homeSlots as unknown as Json,
        away_slots: data.awaySlots as unknown as Json,
      });
  throwIfSupabaseError(error);
    return { ok: true };
  });

export const updateLineupPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number(),
        label: z.string().min(1),
        homeTeam: z.string().min(1),
        awayTeam: z.string().min(1),
        homeSlots: SlotsSchema,
        awaySlots: SlotsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("vmix_lineup_presets")
      .update({
        label: data.label,
        home_team: data.homeTeam,
        away_team: data.awayTeam,
        home_slots: data.homeSlots as unknown as Json,
        away_slots: data.awaySlots as unknown as Json,
      })
      .eq("id", data.id);
   throwIfSupabaseError(error);
    return { ok: true };
  });



export const deleteLineupPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.number() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("vmix_lineup_presets")
      .delete()
      .eq("id", data.id);
  throwIfSupabaseError(error);
    return { ok: true };
  });
// ---------- Team logo codes (auto-fill from swehockey, manual overrides) ----------

export type TeamLogoCode = {
  id: number;
  teamName: string;
  logoCode: string;
  source: "scraped" | "manual";
  updatedAt: string;
};

export const getTeamLogoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamLogoCode[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("team_logo_codes")
      .select("*")
      .order("team_name");
   throwIfSupabaseError(error);
    return (data ?? []).map(
      (r: Record<string, unknown>): TeamLogoCode => ({
        id: Number(r.id),
        teamName: String(r.team_name),
        logoCode: String(r.logo_code),
        source: r.source === "manual" ? "manual" : "scraped",
        updatedAt: String(r.updated_at),
      }),
    );
  });

export const updateTeamLogoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        teamName: z.string().min(1),
        logoCode: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("team_logo_codes")
      .upsert(
        {
          team_name: data.teamName,
          logo_code: data.logoCode,
          source: "manual",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_name" },
      );
   throwIfSupabaseError(error);
    return { ok: true };
  });

export const syncTeamLogoCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ season: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const season = getSeason(data.season) ?? DEFAULT_SEASON;
    const { scrapeTeamCodes } = await import("./vmix.server");
    const codes = await scrapeTeamCodes(season);

    // Read existing manual overrides so we don't overwrite them.
    const { data: existing } = await context.supabase
      .from("team_logo_codes")
      .select("team_name, source");

    const manualTeams = new Set(
      (existing ?? [])
        .filter((r: Record<string, unknown>) => r.source === "manual")
        .map((r: Record<string, unknown>) => String(r.team_name)),
    );

    const rows = Object.entries(codes)
      .filter(([name]) => !manualTeams.has(name))
      .map(([name, code]) => ({
        team_name: name,
        logo_code: code,
        source: "scraped" as const,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      const { error } = await context.supabase
        .from("team_logo_codes")
        .upsert(rows, { onConflict: "team_name" });
    throwIfSupabaseError(error);
    }

    return {
      synced: rows.length,
      skippedManual: manualTeams.size,
      total: Object.keys(codes).length,
    };
  });
