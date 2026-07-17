import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";



function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export async function fetchAllCachedLogos(): Promise<Record<string, string>> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("team_logos")
    .select("team_name, logo_url, status");
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.status === "ok" && row.logo_url) {
      out[row.team_name] = row.logo_url;
    }
  }
  return out;
}

export async function ensureLogoForTeam(team: string): Promise<string | null> {
  const supabase = publicClient();

  // Return cached "ok" result immediately if we have one.
  const { data: existing } = await supabase
    .from("team_logos")
    .select("logo_url, status")
    .eq("team_name", team)
    .maybeSingle();

  if (existing?.status === "ok" && existing.logo_url) {
    return existing.logo_url;
  }

  // Look up this team's logo code from the vMix codes table.
  const { data: codeRow } = await supabase
    .from("team_logo_codes")
    .select("logo_code")
    .eq("team_name", team)
    .maybeSingle();

  if (!codeRow?.logo_code) return null;

  // Build the Supabase Storage URL for the large logo.
  const { getVmixLogoUrl, getVmixAssetBaseUrl } = await import("./vmix-assets");
  const assetBase = getVmixAssetBaseUrl(process.env.SUPABASE_URL ?? "");
  const url = getVmixLogoUrl(assetBase, codeRow.logo_code, "large");

  // Cache the result so the next call returns instantly.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("cache_team_logo", {
      _team: team,
      _url: url,
      _status: "ok",
    });
  } catch {
    // best-effort — cache failure never blocks the caller
  }

  return url;
}


// ---------- Admin helpers ----------

import type { TeamLogoStatus } from "./team-logos.functions";

export async function listAllTeamLogoStatus(): Promise<TeamLogoStatus[]> {
  const supabase = publicClient();
  const [{ data: rows, error }, leagueTeams] = await Promise.all([
    supabase
      .from("team_logos")
      .select("team_name, logo_url, status, source, fetched_at"),
    (async () => {
      const { parseTeamsFromStandings } = await import("./stats.server");
      const { getMergedSeasons } = await import("./seasons.server");
      const seasons = await getMergedSeasons();
      const season =
        seasons[0] ??
        (await import("./seasons.config")).DEFAULT_SEASON;
      return parseTeamsFromStandings("", season);
    })().catch(() => [] as string[]),
  ]);
  if (error) throw error;

  const byTeam = new Map<string, TeamLogoStatus>();
  for (const r of rows ?? []) {
    byTeam.set(r.team_name, {
      team: r.team_name,
      logoUrl: r.logo_url,
      status: (r.status as TeamLogoStatus["status"]) ?? "unknown",
      source: r.source,
      fetchedAt: r.fetched_at,
    });
  }
  for (const team of leagueTeams) {
    if (!byTeam.has(team)) {
      byTeam.set(team, {
        team,
        logoUrl: null,
        status: "unknown",
        source: null,
        fetchedAt: null,
      });
    }
  }
  return Array.from(byTeam.values()).sort((a, b) =>
    a.team.localeCompare(b.team, "sv"),
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";

export async function upsertTeamLogoOverride(
  client: SupabaseClient<Database>,
  team: string,
  url: string,
) {
  const { error } = await client.from("team_logos").upsert({
    team_name: team,
    logo_url: url,
    status: "ok",
    source: "manual",
    fetched_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteTeamLogoRow(
  client: SupabaseClient<Database>,
  team: string,
) {
  const { error } = await client
    .from("team_logos")
    .delete()
    .eq("team_name", team);
  if (error) throw error;
}

