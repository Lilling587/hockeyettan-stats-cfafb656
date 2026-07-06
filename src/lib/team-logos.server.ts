import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SOURCE_URLS = [
  "https://www.hockeyettan.se/stats/",
  "https://www.hockeyettan.se/sodra/",
];
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const HTML_TTL_MS = 60 * 60 * 1000;

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

let htmlCache: { html: string; at: number } | null = null;

async function getSourceHtml(): Promise<string> {
  if (htmlCache && Date.now() - htmlCache.at < HTML_TTL_MS) {
    return htmlCache.html;
  }
  const parts: string[] = [];
  for (const url of SOURCE_URLS) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "lovable-team-logos/1.0" },
      });
      if (res.ok) parts.push(await res.text());
    } catch {
      // continue with remaining sources
    }
  }
  if (parts.length === 0) throw new Error("hockeyettan sources unavailable");
  const html = parts.join("\n");
  htmlCache = { html, at: Date.now() };
  return html;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findCandidate(team: string, html: string): string | null {
  const urls = new Set<string>();
  const rx =
    /src="(https:\/\/www\.hockeyettan\.se\/wp-content\/uploads\/[^"]+\.(?:png|jpg|jpeg|webp))"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) urls.add(m[1]);

  const tokens = normalize(team)
    .split(" ")
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;

  let best: { url: string; score: number } | null = null;
  for (const url of urls) {
    const filename = normalize(
      decodeURIComponent(url.split("/").pop() ?? ""),
    );
    let score = 0;
    for (const tok of tokens) {
      if (filename.includes(tok)) score += tok.length;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { url, score };
    }
  }
  return best?.url ?? null;
}

export async function ensureLogoForTeam(team: string): Promise<string | null> {
  const supabase = publicClient();
  const { data: existing } = await supabase
    .from("team_logos")
    .select("logo_url, status, fetched_at")
    .eq("team_name", team)
    .maybeSingle();

  if (existing) {
    if (existing.status === "ok" && existing.logo_url) {
      return existing.logo_url;
    }
    const age = Date.now() - new Date(existing.fetched_at).getTime();
    if (age < NEGATIVE_TTL_MS) return null;
  }

  let url: string | null = null;
  try {
    const html = await getSourceHtml();
    url = findCandidate(team, html);
  } catch {
    url = null;
  }

  try {
    await supabase.from("team_logos").upsert({
      team_name: team,
      logo_url: url,
      status: url ? "ok" : "missing",
      source: "hockeyettan.se",
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // best-effort cache write
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

export async function upsertTeamLogoOverride(team: string, url: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { error } = await supabaseAdmin.from("team_logos").upsert({
    team_name: team,
    logo_url: url,
    status: "ok",
    source: "manual",
    fetched_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteTeamLogoRow(team: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { error } = await supabaseAdmin
    .from("team_logos")
    .delete()
    .eq("team_name", team);
  if (error) throw error;
}
