import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export const getTeamLogos = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ logos: Record<string, string>; fetchedAt: string }> => {
    const { fetchAllCachedLogos } = await import("./team-logos.server");
    const logos = await fetchAllCachedLogos();
    return { logos, fetchedAt: new Date().toISOString() };
  },
);

export const ensureTeamLogo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ team: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ team: string; url: string | null }> => {
    try {
      // Allow-list against known league teams (static short-name map + any
      // team already cached) so anonymous callers can't spam arbitrary
      // strings into the logo cache or trigger outbound scrapes.
      const { KNOWN_TEAM_NAMES } = await import("./team-short-names");
      const { ensureLogoForTeam, fetchAllCachedLogos } = await import(
        "./team-logos.server"
      );
      if (!KNOWN_TEAM_NAMES.has(data.team)) {
        const cached = await fetchAllCachedLogos();
        if (!(data.team in cached)) {
          return { team: data.team, url: null };
        }
      }
      const url = await ensureLogoForTeam(data.team);
      return { team: data.team, url };
    } catch (error) {
      console.error("ensureTeamLogo failed", data.team, error);
      return { team: data.team, url: null };
    }
  });

// ---------- Admin ----------

export type TeamLogoStatus = {
  team: string;
  logoUrl: string | null;
  status: "ok" | "missing" | "unknown";
  source: string | null;
  fetchedAt: string | null;
};

export const listTeamLogoStatus = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ rows: TeamLogoStatus[] }> => {
    const { listAllTeamLogoStatus } = await import("./team-logos.server");
    const rows = await listAllTeamLogoStatus();
    return { rows };
  });

export const setTeamLogoOverride = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        team: z.string().min(1),
        url: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { upsertTeamLogoOverride } = await import("./team-logos.server");
    await upsertTeamLogoOverride(context.supabase, data.team, data.url);
    return { ok: true };
  });

export const clearTeamLogoCache = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ team: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { deleteTeamLogoRow } = await import("./team-logos.server");
    await deleteTeamLogoRow(context.supabase, data.team);
    return { ok: true };
  });

/** Admin-only re-fetch that bypasses the anonymous allow-list and forces a
 *  fresh Storage URL lookup regardless of what's currently cached. */
export const adminRefetchTeamLogo = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ team: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ team: string; url: string | null }> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Find this team's logo code from the vMix codes table.
    const { data: codeRow } = await supabaseAdmin
      .from("team_logo_codes")
      .select("logo_code")
      .eq("team_name", data.team)
      .maybeSingle();

    if (!codeRow?.logo_code) {
      // No logo code means the team hasn't been synced in /admin/vmix yet.
      return { team: data.team, url: null };
    }

    // Build the Supabase Storage URL for the large logo.
    const { getVmixLogoUrl, getVmixAssetBaseUrl } = await import("./vmix-assets");
    const assetBase = getVmixAssetBaseUrl(process.env.SUPABASE_URL ?? "");
    const url = getVmixLogoUrl(assetBase, codeRow.logo_code, "large");

    // Upsert directly via service role — no RPC, no silent failures, no
    // RLS blocking. Replaces any existing entry including old hockeyettan.se URLs.
    const { error } = await supabaseAdmin
      .from("team_logos")
      .upsert(
        {
          team_name: data.team,
          logo_url: url,
          status: "ok",
          source: "scraped",
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "team_name" },
      );
    if (error) throw new Error(`Kunde inte spara logga: ${error.message}`);

    return { team: data.team, url };
  });
