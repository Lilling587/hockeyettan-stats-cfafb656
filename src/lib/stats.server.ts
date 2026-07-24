import Firecrawl from "@mendable/firecrawl-js";
import { generateText } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { BriefingSchema, TeamsSchema, type Briefing } from "./stats.functions";
import { DEFAULT_SEASON, type Season } from "./seasons.config";
import { shortTeamName, KNOWN_TEAM_NAMES } from "./team-short-names";

async function generateJson<T extends z.ZodTypeAny>(
  model: ReturnType<typeof aiModel>,
  schema: T,
  prompt: string,
): Promise<z.infer<T>> {
  const { text } = await generateText({
    model,
    prompt:
      prompt +
      `\n\nRespond with ONLY valid JSON matching this requirement, no prose, no markdown code fences.`,
  });
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.search(/[\[{]/);
  if (start > 0) raw = raw.slice(start);
  try {
    return schema.parse(JSON.parse(raw));
  } catch (e) {
    throw new Error(
      `AI returned data that did not match expected shape: ${(e as Error).message}. Raw start: ${raw.slice(0, 200)}`,
    );
  }
}

// ---------- Clients ----------

function admin() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server env missing (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const FIRECRAWL_ENV_CANDIDATES = ["FIRECRAWL_API_KEY_1", "FIRECRAWL_API_KEY"] as const;

function resolveFirecrawlKey(): { key: string | null; usedVar: string | null; missingVars: string[] } {
  const missing: string[] = [];
  for (const name of FIRECRAWL_ENV_CANDIDATES) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return { key: value, usedVar: name, missingVars: missing };
    }
    missing.push(name);
  }
  return { key: null, usedVar: null, missingVars: missing };
}

function logFirecrawlError(context: string, err: unknown, url?: string) {
  const { usedVar, missingVars } = resolveFirecrawlKey();
  const availableEnv = Object.keys(process.env).filter((k) => k.startsWith("FIRECRAWL"));
  const e = err as { message?: string; name?: string; status?: number; statusCode?: number; response?: { status?: number; data?: unknown } };
  console.error(
    `[firecrawl:${context}] scrape failed`,
    JSON.stringify(
      {
        url,
        error: e?.message ?? String(err),
        errorName: e?.name,
        status: e?.status ?? e?.statusCode ?? e?.response?.status,
        response: e?.response?.data,
        keyResolved: Boolean(usedVar),
        usedEnvVar: usedVar,
        missingEnvVars: usedVar ? [] : missingVars,
        firecrawlEnvVarsPresent: availableEnv,
        hint: usedVar
          ? "Key resolved but request failed — check Firecrawl account credits/quota, network egress, or upstream URL."
          : `Set one of: ${missingVars.join(", ")}. Link the Firecrawl connector or add the secret; then restart the dev server so the process picks it up.`,
      },
      null,
      2,
    ),
  );
}

function firecrawl() {
  const { key, missingVars } = resolveFirecrawlKey();
  if (!key) {
    const availableEnv = Object.keys(process.env).filter((k) => k.startsWith("FIRECRAWL"));
    console.error(
      `[firecrawl:init] Missing API key`,
      JSON.stringify(
        {
          missingEnvVars: missingVars,
          firecrawlEnvVarsPresent: availableEnv,
          hint: `Set one of: ${missingVars.join(", ")}. Link the Firecrawl connector or add the secret; then restart the dev server so the process picks it up.`,
        },
        null,
        2,
      ),
    );
    throw new Error(
      `FIRECRAWL_API_KEY is not configured (checked: ${missingVars.join(", ")})`,
    );
  }
  return new Firecrawl({ apiKey: key });
}

function aiModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const gateway = createLovableAiGatewayProvider(key);
  return gateway("google/gemini-2.5-flash");
}

// ---------- Cache ----------

export async function getCached(key: string, ttlMs: number) {
  const { data } = await admin()
    .from("cached_briefings")
    .select("payload, fetched_at")
    .eq("matchup_key", key)
    .maybeSingle();
  if (!data) return null;
  const ageMs = Date.now() - new Date(data.fetched_at as string).getTime();
  if (ageMs > ttlMs) return null;
  return data.payload as unknown;
}

export async function setCached(key: string, payload: unknown) {
  await admin()
    .from("cached_briefings")
    .upsert(
      {
        matchup_key: key,
        payload: payload as object,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "matchup_key" },
    );
}

// ---------- Scrape helpers ----------

const STATS_BASE_URL = "https://stats.swehockey.se";
const LEAGUE_NAME = "Hockeyettan Södra";

type Urls = {
  standings: string;
  schedule: string;
  roster: string;
  scoring: string;
  teamStats: string;
  specialTeams: string;
};

function buildUrls(competitionId: string): Urls {
  return {
    standings: `${STATS_BASE_URL}/ScheduleAndResults/Standings/${competitionId}`,
    schedule: `${STATS_BASE_URL}/ScheduleAndResults/Schedule/${competitionId}`,
    roster: `${STATS_BASE_URL}/Teams/Info/TeamRoster/${competitionId}`,
    scoring: `${STATS_BASE_URL}/Teams/Info/PlayersByTeam/${competitionId}`,
    teamStats: `${STATS_BASE_URL}/Teams/Statistics/ScoringAndGoalkeeping/${competitionId}`,
    specialTeams: `${STATS_BASE_URL}/Teams/Statistics/PowerplayAndPenaltyKilling/${competitionId}`,
  };
}

function htmlEntityDecode(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|\u00a0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTableRowsAsMarkdown(html: string): string {
  const rows: string[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const text = htmlEntityDecode(
        cellMatch[1]
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, " "),
      );
      cells.push(text);
    }
    if (cells.some(Boolean)) rows.push(`| ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
}

async function fetchPageTablesAsMarkdown(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`Direct stats fetch failed [${response.status}] for ${url}`);
  }
  return extractTableRowsAsMarkdown(await response.text());
}

async function scrapeMd(url: string): Promise<string> {
  const { key, missingVars } = resolveFirecrawlKey();
  if (!key) {
    console.warn(
      `[firecrawl:scrapeMd] API key missing; using direct stats HTML fallback`,
      JSON.stringify({ url, missingEnvVars: missingVars }),
    );
    return fetchPageTablesAsMarkdown(url);
  }

  try {
    const fc = firecrawl();
    const res = await fc.scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true,
    });
    const md =
      (res as { markdown?: string }).markdown ??
      (res as { data?: { markdown?: string } }).data?.markdown ??
      "";
    if (md.trim().length > 0) return md;
    console.warn(`[firecrawl:scrapeMd] empty markdown response; falling back`, JSON.stringify({ url }));
  } catch (err) {
    logFirecrawlError("scrapeMd", err, url);
  }
  return fetchPageTablesAsMarkdown(url);
}

function extractTeamSection(md: string, teamName: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((line) =>
    line.includes(`| | ${teamName} | ${teamName} |`),
  );
  if (start === -1) return md.slice(0, 10000);
  const end = lines.findIndex(
    (line, index) =>
      index > start && /^\| \| .+ \| .+ \| \[\\\[Top\\\]\]/.test(line),
  );
  return lines.slice(start, end === -1 ? start + 90 : end).join("\n");
}

function extractRowsForTeam(md: string, needles: string[]): string {
  const lower = needles.map((n) => n.toLowerCase()).filter(Boolean);
  const rows = md
    .split("\n")
    .filter((line) => {
      const l = line.toLowerCase();
      return lower.some((n) => l.includes(n));
    });
  return rows.length > 0 ? rows.join("\n") : md.slice(0, 4000);
}

function extractH2HRows(scheduleMd: string, home: string, away: string): string {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  const rows = scheduleMd
    .split("\n")
    .filter((line) => {
      const l = line.toLowerCase();
      return l.includes(h) && l.includes(a);
    });
  return rows.join("\n") || "(no head-to-head rows found in schedule)";
}

function extractLastFiveRows(scheduleMd: string, teamName: string): string {
  const needle = teamName.toLowerCase();
  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
  const scoreRe = /\|\s*(\d+)\s*-\s*(\d+)\s*\|/;
  const rows = scheduleMd
    .split("\n")
    .map((l) => l.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")) // strip [text](url) → text
    .filter((l) => l.toLowerCase().includes(needle) && dateRe.test(l) && scoreRe.test(l))
    .map((l) => ({ line: l, date: (l.match(dateRe) as RegExpMatchArray)[1] }))
    .filter((v, i, arr) => arr.findIndex((x) => x.line === v.line) === i)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((r) => r.line);
  return rows.join("\n") || "(no played games found for this team)";
}

function normalizeScheduleText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLastFiveGames(scheduleMd: string, teamName: string): Briefing["home"]["lastFive"] {
  return extractLastFiveRows(scheduleMd, teamName)
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => {
      const date = line.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? "";
      const cells = line.split("|").slice(1, -1).map(normalizeScheduleText);
      const gameCell = cells.find((cell) => cell.includes(" - ") && !/^\d+\s*-\s*\d+$/.test(cell)) ?? "";
      const scoreCell = cells.find((cell) => /^\d+\s*-\s*\d+$/.test(cell)) ?? "";
      const periodCell = cells.find((cell) => /^\([\d\s,\-]+\)$/.test(cell)) ?? "";
      const teams = gameCell.split(/\s+-\s+/);
      const score = scoreCell.match(/^(\d+)\s*-\s*(\d+)$/);
      if (teams.length !== 2 || !score) return null;
      const [homeTeam, awayTeam] = teams;
      const isHome = homeTeam.toLowerCase() === teamName.toLowerCase();
      const opponent = isHome ? awayTeam : homeTeam;
      const homeGoals = Number(score[1]);
      const awayGoals = Number(score[2]);
      const teamGoals = isHome ? homeGoals : awayGoals;
      const opponentGoals = isHome ? awayGoals : homeGoals;
      const wentBeyondRegulation = (periodCell.match(/\d+\s*-\s*\d+/g) ?? []).length > 3;
      const result: "W" | "T" | "L" | "OTW" | "OTL" =
        teamGoals === opponentGoals
          ? "T"
          : teamGoals > opponentGoals
            ? wentBeyondRegulation ? "OTW" : "W"
            : wentBeyondRegulation ? "OTL" : "L";
      return { date, opponent, score: `${teamGoals}-${opponentGoals}`, result, isHome };
    })
    .filter((game): game is NonNullable<typeof game> => game !== null)
    .slice(0, 5);
}

function parseHeadToHead(
  scheduleMd: string,
  home: string,
  away: string,
): Briefing["headToHead"] {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  const seen = new Set<string>();
  const out: Briefing["headToHead"] = [];
  for (const line of scheduleMd.split("\n")) {
    if (!line.startsWith("|")) continue;
    const date = line.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    if (!date) continue;
    const cells = line.split("|").slice(1, -1).map(normalizeScheduleText);
    const gameCell =
      cells.find((cell) => cell.includes(" - ") && !/^\d+\s*-\s*\d+$/.test(cell)) ?? "";
    const scoreCell = cells.find((cell) => /^\d+\s*-\s*\d+$/.test(cell)) ?? "";
    const teams = gameCell.split(/\s+-\s+/);
    if (teams.length !== 2) continue;
    const [homeTeam, awayTeam] = teams;
    const lh = homeTeam.toLowerCase();
    const la = awayTeam.toLowerCase();
    const isH2H = (lh.includes(h) && la.includes(a)) || (lh.includes(a) && la.includes(h));
    if (!isH2H) continue;
    const key = `${date}|${homeTeam}|${awayTeam}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const scoreMatch = scoreCell.match(/^(\d+)\s*-\s*(\d+)$/);
    const score = scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : "";
    out.push({ date, homeTeam, awayTeam, score, gameId: null });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function enrichH2HWithGameIds(
  h2h: Briefing["headToHead"],
  season: Season,
): Promise<Briefing["headToHead"]> {
  if (h2h.length === 0) return h2h;
  const games = await getScheduleGames(season).catch(() => [] as ScheduleGame[]);
  return h2h.map((g) => {
    const lh = g.homeTeam.toLowerCase();
    const la = g.awayTeam.toLowerCase();
    const match = games.find(
      (s) =>
        s.date === g.date &&
        s.homeTeam.toLowerCase().includes(lh) &&
        s.awayTeam.toLowerCase().includes(la),
    );
    return { ...g, gameId: match?.id ?? null };
  });
}

function parseSpecialTeamsStats(
  specialTeamsMd: string,
  teamCode: string | undefined,
): { powerPlayPct: number | null; penaltyKillPct: number | null } {
  if (!teamCode) return { powerPlayPct: null, penaltyKillPct: null };
  let section: "pp" | "pk" | null = null;
  let powerPlayPct: number | null = null;
  let penaltyKillPct: number | null = null;
  for (const line of specialTeamsMd.split("\n")) {
    if (line.includes("Powerplay Efficiency")) section = "pp";
    if (line.includes("Penalty Killing")) section = "pk";
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.replace(/\*\*/g, "").trim());
    if (cells[1]?.toUpperCase() !== teamCode.toUpperCase()) continue;
    const pct = Number(cells[5]?.replace(",", "."));
    if (!Number.isFinite(pct)) continue;
    if (section === "pp") powerPlayPct = pct;
    if (section === "pk") penaltyKillPct = pct;
  }
  return { powerPlayPct, penaltyKillPct };
}

function normalizeTeamKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickSpecialTeams(
  byName: Record<string, SpecialTeamsEntry>,
  teamName: string,
): SpecialTeamsEntry {
  if (byName[teamName]) return byName[teamName];
  const key = normalizeTeamKey(teamName);
  for (const [k, v] of Object.entries(byName)) {
    if (normalizeTeamKey(k) === key) return v;
  }
  return { powerPlayPct: null, penaltyKillPct: null, powerPlayGoals: null, penaltyKillGoalsAgainst: null };
}

type SpecialTeamsEntry = {
  powerPlayPct: number | null;
  penaltyKillPct: number | null;
  powerPlayGoals: number | null;
  penaltyKillGoalsAgainst: number | null;
};

async function fetchSpecialTeamsFromHtml(
  urls: Urls,
  attempt = 1,
): Promise<Record<string, SpecialTeamsEntry>> {
  try {
    const res = await fetch(urls.specialTeams, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const result: Record<string, SpecialTeamsEntry> = {};
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const titleRe = /<span\s+title="([^"]+)"[^>]*>\s*<strong>([^<]+)<\/strong>/i;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const sections: Array<{ key: "pp" | "pk"; html: string }> = [];
    const subtitleRe = /<th\b[^>]*class="[^"]*tdSubTitle[^"]*"[^>]*>([\s\S]*?)<\/th>/gi;
    const subtitles = [...html.matchAll(subtitleRe)]
      .map((match) => ({
        title: htmlEntityDecode(match[1].replace(/<[^>]+>/g, " ")),
        start: (match.index ?? 0) + match[0].length,
      }))
      .filter((section) => /Powerplay Efficiency|Penalty Killing/i.test(section.title));

    for (const [index, section] of subtitles.entries()) {
      const next = subtitles[index + 1]?.start ?? html.length;
      sections.push({
        key: /Powerplay Efficiency/i.test(section.title) ? "pp" : "pk",
        html: html.slice(section.start, next),
      });
    }

    for (const section of sections) {
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(section.html)) !== null) {
        const rowHtml = rowMatch[1];
        const titleMatch = rowHtml.match(titleRe);
        if (!titleMatch) continue;
        const teamName = titleMatch[1].trim();
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        const cellIter = new RegExp(cellRe);
        while ((cellMatch = cellIter.exec(rowHtml)) !== null) {
          cells.push(
            cellMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;|\u00a0/g, " ").trim(),
          );
        }
        const pct = Number(cells[5]?.replace(",", "."));
        if (!Number.isFinite(pct)) continue;
        const goals = Number(cells[4]?.replace(",", "."));
        const entry = result[teamName] ?? {
          powerPlayPct: null,
          penaltyKillPct: null,
          powerPlayGoals: null,
          penaltyKillGoalsAgainst: null,
        };
        if (section.key === "pp") {
          entry.powerPlayPct = pct;
          if (Number.isFinite(goals)) entry.powerPlayGoals = goals;
        }
        if (section.key === "pk") {
          entry.penaltyKillPct = pct;
          if (Number.isFinite(goals)) entry.penaltyKillGoalsAgainst = goals;
        }
        result[teamName] = entry;
      }
    }
    if (Object.keys(result).length === 0 && attempt < 2) {
      console.warn("[specialTeams] empty result, retrying once");
      await new Promise((r) => setTimeout(r, 400));
      return fetchSpecialTeamsFromHtml(urls, attempt + 1);
    }
    return result;
  } catch (err) {
    console.warn(`[specialTeams] HTML fetch failed (attempt ${attempt}):`, (err as Error).message);
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400));
      return fetchSpecialTeamsFromHtml(urls, attempt + 1);
    }
    return {} as Record<string, SpecialTeamsEntry>;
  }
}


// Generic helper: extract <td> cell text contents (tags stripped) from a row.
function extractTdCells(rowHtml: string): string[] {
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowHtml)) !== null) {
    cells.push(
      m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return cells;
}

async function fetchStandingsFromHtml(
  urls: Urls,
): Promise<Record<string, { position: number | null; gamesPlayed: number | null; points: number | null }>> {
  try {
    const res = await fetch(urls.standings, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const result: Record<string, { position: number | null; gamesPlayed: number | null; points: number | null }> = {};
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const cells = extractTdCells(rowMatch[1]);
      if (cells.length < 8) continue;
      const position = Number(cells[0]);
      const name = cells[1];
      const gamesPlayed = Number(cells[2]);
      const points = Number(cells[8]);
      if (!Number.isFinite(position) || !name || !Number.isFinite(gamesPlayed) || !Number.isFinite(points)) continue;
      if (name in result) continue;
      result[name] = { position, gamesPlayed, points };
    }
    return result;
  } catch (err) {
    console.warn("[standings] HTML fallback failed:", (err as Error).message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// fetchScoringPageData — single fetch of the PlayersByTeam page that returns
// top scorers, goalies, AND discipline (PIM) for every team in one pass.
//
// Previously fetchTopScorersFromHtml, fetchGoaliesFromHtml, and
// fetchDisciplineFromHtml each independently fetched urls.scoring, meaning
// buildBriefing() hit that page up to three times per cold call. This
// consolidates all three into one HTTP request, parsed once, with each
// consumer reading from its own result bucket.
// ---------------------------------------------------------------------------

type ScoringPageData = {
  topScorers: Record<string, Briefing["home"]["topScorers"]>;
  goalies: Record<string, Briefing["home"]["goalies"]>;
  discipline: Record<string, NonNullable<Briefing["home"]["discipline"]>>;
  faceoffs: Record<string, {
    teamFoPct: number | null;
    players: Array<{ name: string; foWins: number; foLosses: number; foTotal: number; foPct: number; }>;
  }>;
};

async function fetchScoringPageData(urls: Urls): Promise<ScoringPageData> {
  const topScorers: Record<string, Briefing["home"]["topScorers"]> = {};
  const goalies: Record<string, Briefing["home"]["goalies"]> = {};
  const discipline: Record<string, NonNullable<Briefing["home"]["discipline"]>> = {};
  const faceoffs: Record<string, {
    teamFoPct: number | null;
    players: Array<{ name: string; foWins: number; foLosses: number; foTotal: number; foPct: number; }>;
  }> = {};

  try {
    const res = await fetch(urls.scoring, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();

    // Each team's data lives between anchor tags:
    // <a id="Team Name"> </a> ... <a id="Next Team"> </a>
    const anchorRe = /<a\s+id="([^"]+)">\s*<\/a>/g;
    const anchors: Array<{ name: string; index: number }> = [];
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(html)) !== null) {
      anchors.push({ name: am[1], index: am.index });
    }

    const parseNum = (raw: string): number | null => {
      if (!raw || raw === "N/A") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    for (let i = 0; i < anchors.length; i++) {
      const teamName = anchors[i].name;
      const start = anchors[i].index;
      const end = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
      const fullSection = html.slice(start, end);

      // Split skater section from goalie subtable once, reuse for all three parsers.
      const gkIdx = fullSection.search(/Goalkeeping Statistics/i);
      const skaterSection = gkIdx === -1 ? fullSection : fullSection.slice(0, gkIdx);
      const gkSection = gkIdx === -1 ? "" : fullSection.slice(gkIdx);

      // --- Top scorers (first 5 skaters by points) ---
      const scorerList: Briefing["home"]["topScorers"] = [];
      // --- Discipline (PIM totals + top offenders, skaters only) ---
      let totalPim = 0;
      let maxGp = 0;
      const offenders: Array<{ name: string; pim: number; gamesPlayed: number | null }> = [];
      const foEntries: Array<{ name: string; foWins: number; foLosses: number; foTotal: number; foPct: number }> = [];

      const skaterRowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      // Player row: [rank, no, name, pos, GP, G, A, TP, PIM, ...]
      while ((rowMatch = skaterRowRe.exec(skaterSection)) !== null) {
        const cells = extractTdCells(rowMatch[1]);
        if (cells.length < 9) continue;
        const rank = Number(cells[0]);
        if (!Number.isFinite(rank)) continue;
        const name = cells[2];
        if (!name) continue;
        const gp = Number(cells[4]);
        const goals = Number(cells[5]);
        const assists = Number(cells[6]);
        const points = Number(cells[7]);
        const pim = Number(cells[8]);

        // Top scorers: keep first 5 valid rows
        if (scorerList.length < 5 && Number.isFinite(points)) {
          scorerList.push({
            name,
            goals: Number.isFinite(goals) ? goals : null,
            assists: Number.isFinite(assists) ? assists : null,
            points,
            gamesPlayed: Number.isFinite(gp) ? gp : null,
          });
        }

        // Discipline: sum all skaters
        if (Number.isFinite(pim)) {
          totalPim += pim;
          if (Number.isFinite(gp) && gp > maxGp) maxGp = gp;
          if (pim > 0) {
            offenders.push({ name, pim, gamesPlayed: Number.isFinite(gp) ? gp : null });
          }
        }

        // Collect faceoff data — process all rows (not just top scorers)
        const foWins = cells.length >= 21 ? Number(cells[17]) : NaN;
        const foLosses = cells.length >= 21 ? Number(cells[18]) : NaN;
        const foTotal = cells.length >= 21 ? Number(cells[19]) : NaN;
        const foPctStr = cells.length >= 21 ? cells[20] : "N/A";
        const foPctVal = foPctStr === "N/A" || foPctStr === "" ? null : Number(foPctStr);
        if (
          Number.isFinite(foWins) &&
          Number.isFinite(foLosses) &&
          Number.isFinite(foTotal) &&
          foPctVal !== null &&
          Number.isFinite(foPctVal)
        ) {
          foEntries.push({ name, foWins, foLosses, foTotal, foPct: foPctVal });
        }
      }

      if (scorerList.length > 0) topScorers[teamName] = scorerList;

      offenders.sort((a, b) => b.pim - a.pim);
      discipline[teamName] = {
        totalPim,
        gamesPlayed: maxGp,
        perGame: maxGp > 0 ? totalPim / maxGp : 0,
        topOffenders: offenders.slice(0, 3),
      };

      // --- Faceoffs ---
      const totalFoWins = foEntries.reduce((s, e) => s + e.foWins, 0);
      const totalFoTotal = foEntries.reduce((s, e) => s + e.foTotal, 0);
      const teamFoPct = totalFoTotal > 0
        ? Math.round((totalFoWins / totalFoTotal) * 10000) / 100
        : null;
      const foPlayers = foEntries
        .filter((e) => e.foTotal >= 10)
        .sort((a, b) => b.foPct - a.foPct)
        .slice(0, 5);
      faceoffs[teamName] = { teamFoPct, players: foPlayers };

      // --- Goalies ---
      // Columns: Rk, No, Name, GPT, GKD, GPI, MIP, GA, SVS, SOG, SVS%, GAA, SO, W, L (15 cells)
      if (gkSection) {
        const goalieList: Briefing["home"]["goalies"] = [];
        const gkRowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        let gm: RegExpExecArray | null;
        while ((gm = gkRowRe.exec(gkSection)) !== null) {
          const cells = extractTdCells(gm[1]);
          if (cells.length < 15) continue;
          const name = cells[2];
          if (!name) continue;
          const gp = parseNum(cells[5]);
          if (gp == null || gp === 0) continue; // skip unused goalies
          goalieList.push({
            name,
            gamesPlayed: gp,
            minutes: cells[6] || null,
            goalsAgainst: parseNum(cells[7]),
            saves: parseNum(cells[8]),
            shotsAgainst: parseNum(cells[9]),
            savePct: parseNum(cells[10]),
            gaa: parseNum(cells[11]),
            shutouts: parseNum(cells[12]),
            wins: parseNum(cells[13]),
            losses: parseNum(cells[14]),
          });
          if (goalieList.length >= 5) break;
        }
        if (goalieList.length > 0) {
          goalieList.sort((a, b) => (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0));
          goalies[teamName] = goalieList;
        }
      }
    }
  } catch (err) {
    console.warn("[scoringPage] fetch failed:", (err as Error).message);
  }

  return { topScorers, goalies, discipline, faceoffs };
}

// ---------------------------------------------------------------------------
// NOTE ON SCHEDULE-DERIVED HELPERS:
//
// fetchLastFiveFromHtml, fetchVenueFormFromHtml, and fetchPeriodGoalsFromHtml
// previously each independently fetched urls.schedule. They've been replaced
// with pure synchronous compute* functions that operate on the already-fetched
// memoized ScheduleGame[] from getScheduleGames(season). The schedule HTML is
// now fetched at most once per season per process (cached in scheduleCache).
// ---------------------------------------------------------------------------

function computeLastFive(
  games: ScheduleGame[],
  teamNames: string[],
): Record<string, Briefing["home"]["lastFive"]> {
  const result: Record<string, Briefing["home"]["lastFive"]> = {};
  for (const teamName of teamNames) {
    const teamGames = games
      .filter((g) => g.played && (g.homeTeam === teamName || g.awayTeam === teamName))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map((g) => {
        const isHome = g.homeTeam === teamName;
        const opponent = isHome ? g.awayTeam : g.homeTeam;
        const teamGoals = (isHome ? g.homeGoals : g.awayGoals) ?? 0;
        const opponentGoals = (isHome ? g.awayGoals : g.homeGoals) ?? 0;
        const wentBeyond = g.periodCount > 3;
        const result: "W" | "T" | "L" | "OTW" | "OTL" =
          teamGoals === opponentGoals
            ? "T"
            : teamGoals > opponentGoals
              ? wentBeyond ? "OTW" : "W"
              : wentBeyond ? "OTL" : "L";
        return { date: g.date, opponent, score: `${teamGoals}-${opponentGoals}`, result, isHome };
      });
    if (teamGames.length > 0) result[teamName] = teamGames;
  }
  return result;
}

type HotPlayer = NonNullable<Briefing["home"]["hotPlayer"]>;
async function fetchHotPlayersFromGameLogs(
  urls: Urls,
  teamLookups: Array<{ name: string; code: string | undefined }>,
  recentGames = 5,
): Promise<Record<string, HotPlayer>> {
  try {
    const schedRes = await fetch(urls.schedule, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const schedHtml = await schedRes.text();
    type Game = { id: string; date: string; homeTeam: string; awayTeam: string };
    const allGames: Game[] = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(schedHtml)) !== null) {
      const raw = rm[1];
      const gidMatch = raw.match(/\/Game\/Events\/(\d+)/);
      if (!gidMatch) continue;
      const text = raw
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "|")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
      const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const cells = text.split("|").map((s) => s.trim()).filter(Boolean);
      const matchupRe = /^(.+?)\s+-\s+(.+?)$/;
      const scoreRe = /^\d+\s*-\s*\d+$/;
      const matchupCell = cells.find(
        (c) => matchupRe.test(c) && !scoreRe.test(c) && !/\d{4}-\d{2}-\d{2}/.test(c),
      );
      const hasScore = cells.some((c) => scoreRe.test(c));
      if (!dateMatch || !matchupCell || !hasScore) continue;
      const teams = matchupCell.match(matchupRe);
      if (!teams) continue;
      allGames.push({
        id: gidMatch[1],
        date: dateMatch[1],
        homeTeam: teams[1].trim(),
        awayTeam: teams[2].trim(),
      });
    }
    const perTeam = new Map<string, { code: string; games: Game[] }>();
    for (const { name, code } of teamLookups) {
      if (!code) continue;
      const games = allGames
        .filter((g) => g.homeTeam === name || g.awayTeam === name)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, recentGames);
      if (games.length > 0) perTeam.set(name, { code, games });
    }
    const gameIds = new Set<string>();
    for (const { games } of perTeam.values()) for (const g of games) gameIds.add(g.id);
    const fetchedPages = new Map<string, string>();
    await Promise.all(
      Array.from(gameIds).map(async (id) => {
        try {
          const r = await fetch(`https://stats.swehockey.se/Game/Events/${id}`, {
            headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
          });
          fetchedPages.set(id, await r.text());
        } catch {
          // ignore individual page failures
        }
      }),
    );
    type GoalEntry = { teamCode: string; scorer: string; assists: string[] };
    const parseGoals = (html: string): GoalEntry[] => {
      const goals: GoalEntry[] = [];
      const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let tr: RegExpExecArray | null;
      const namePartRe = /\d+\.\s*([^<(]+?)(?=\s*<|\s*\(|$)/;
      const cleanName = (s: string) =>
        s.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
      while ((tr = trRe.exec(html)) !== null) {
        const row = tr[1];
        if (!/Total goals scored/i.test(row)) continue;
        const cells = row.split(/<\/td>/i);
        if (cells.length < 4) continue;
        const teamCodeMatch = cells[2].replace(/<[^>]+>/g, "").trim();
        if (!/^[A-ZÅÄÖ]{2,4}$/.test(teamCodeMatch)) continue;
        const scorerCell = cells[3];
        const beforeSpan = scorerCell.split(/<span/i)[0];
        const scorerM = beforeSpan.match(namePartRe);
        if (!scorerM) continue;
        const scorer = cleanName(scorerM[1]);
        const assists: string[] = [];
        const assistRe = /Assists in tournament[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let am: RegExpExecArray | null;
        while ((am = assistRe.exec(scorerCell)) !== null) {
          const inner = am[1].replace(/<[^>]+>/g, "");
          const nm = inner.match(namePartRe);
          if (nm) assists.push(cleanName(nm[1]));
        }
        goals.push({ teamCode: teamCodeMatch, scorer, assists });
      }
      return goals;
    };
    const result: Record<string, HotPlayer> = {};
    for (const [teamName, { code, games }] of perTeam.entries()) {
      const tally = new Map<string, { goals: number; assists: number }>();
      for (const g of games) {
        const html = fetchedPages.get(g.id);
        if (!html) continue;
        const goals = parseGoals(html);
        for (const gl of goals) {
          if (gl.teamCode !== code) continue;
          const sc = tally.get(gl.scorer) ?? { goals: 0, assists: 0 };
          sc.goals += 1;
          tally.set(gl.scorer, sc);
          for (const a of gl.assists) {
            const ac = tally.get(a) ?? { goals: 0, assists: 0 };
            ac.assists += 1;
            tally.set(a, ac);
          }
        }
      }
      let top: { name: string; goals: number; assists: number; points: number } | null = null;
      for (const [name, t] of tally.entries()) {
        const points = t.goals + t.assists;
        if (!top || points > top.points || (points === top.points && t.goals > top.goals)) {
          top = { name, goals: t.goals, assists: t.assists, points };
        }
      }
      if (top && top.points > 0) {
        result[teamName] = {
          name: top.name,
          points: top.points,
          goals: top.goals,
          assists: top.assists,
          games: games.length,
        };
      }
    }
    return result;
  } catch (err) {
    console.warn("[hotPlayer] failed:", (err as Error).message);
    return {};
  }
}

type VenueForm = NonNullable<Briefing["home"]["venueForm"]>;
type ResultLetter = VenueForm["home"]["results"][number];

function computeStreak(results: ResultLetter[]): VenueForm["home"]["streak"] {
  if (results.length === 0) return null;
  const bucket = (r: ResultLetter): "W" | "T" | "L" =>
    r === "W" || r === "OTW" ? "W" : r === "T" ? "T" : "L";
  const type = bucket(results[0]);
  let count = 0;
  for (const r of results) {
    if (bucket(r) === type) count += 1;
    else break;
  }
  return { type, count };
}

function computeVenueForm(
  games: ScheduleGame[],
  teamNames: string[],
): Record<string, VenueForm> {
  const out: Record<string, VenueForm> = {};
  for (const teamName of teamNames) {
    const home: ResultLetter[] = [];
    const away: ResultLetter[] = [];
    const teamGames = games
      .filter((g) => g.played && (g.homeTeam === teamName || g.awayTeam === teamName))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const g of teamGames) {
      const isHome = g.homeTeam === teamName;
      const teamGoals = (isHome ? g.homeGoals : g.awayGoals) ?? 0;
      const oppGoals = (isHome ? g.awayGoals : g.homeGoals) ?? 0;
      const wentBeyond = g.periodCount > 3;
      const r: ResultLetter =
        teamGoals === oppGoals
          ? "T"
          : teamGoals > oppGoals
            ? wentBeyond ? "OTW" : "W"
            : wentBeyond ? "OTL" : "L";
      (isHome ? home : away).push(r);
    }
    out[teamName] = {
      home: { results: home, streak: computeStreak(home) },
      away: { results: away, streak: computeStreak(away) },
    };
  }
  return out;
}

type PeriodGoals = NonNullable<Briefing["home"]["periodGoals"]>;

function computePeriodGoals(
  games: ScheduleGame[],
  teamNames: string[],
): Record<string, PeriodGoals> {
  const out: Record<string, PeriodGoals> = {};
  for (const teamName of teamNames) {
    const totals: PeriodGoals = { p1: 0, p2: 0, p3: 0, ot: 0, total: 0, games: 0 };
    for (const g of games) {
      if (!g.played) continue;
      const isHome = g.homeTeam === teamName;
      const isAway = g.awayTeam === teamName;
      if (!isHome && !isAway) continue;
      totals.games += 1;
      g.periods.forEach((pair, idx) => {
        const goals = isHome ? pair[0] : pair[1];
        if (idx === 0) totals.p1 += goals;
        else if (idx === 1) totals.p2 += goals;
        else if (idx === 2) totals.p3 += goals;
        else totals.ot += goals;
        totals.total += goals;
      });
    }
    out[teamName] = totals;
  }
  return out;
}

async function fetchTeamCodeMap(_urls: Urls): Promise<Record<string, string>> {
  // Team codes are already maintained in team-short-names.ts (sourced from the
  // same swehockey stats page). No network fetch needed — just invert the map.
  const map: Record<string, string> = {};
  for (const name of KNOWN_TEAM_NAMES) {
    map[name] = shortTeamName(name);
  }
  return map;
}


export async function parseTeamsFromStandings(
  _md: string,
  season: Season = DEFAULT_SEASON,
): Promise<string[]> {
  const urls = buildUrls(season.competitionId);
  const byName = await fetchStandingsFromHtml(urls);
  const teams = Object.entries(byName)
    .sort((a, b) => (a[1].position ?? 99) - (b[1].position ?? 99))
    .map(([name]) => name);
  if (teams.length === 0) {
    throw new Error("Could not parse any teams from standings page");
  }
  return teams;
}

function buildTeamContextMd(
  urls: Urls,
  teamName: string,
  teamCode: string | undefined,
  rosterMd: string,
  scoringMd: string,
  teamStatsMd: string,
  specialTeamsMd: string,
  lastFiveMd: string,
): string {
  const needles = [teamName, teamCode ?? ""].filter(Boolean);
  return `Team: ${teamName}${teamCode ? ` (code: ${teamCode})` : ""}\n\nSource: ${urls.roster}\n\n=== SENIOR TEAM ROSTER ===\n${extractTeamSection(rosterMd, teamName)}\n\nSource: ${urls.scoring}\n\n=== PLAYERS-BY-TEAM (full stats incl. G/A/TP, sorted by points) ===\n${extractTeamSection(scoringMd, teamName)}\n\nSource: ${urls.teamStats}\n\n=== TEAM SCORING / GOALKEEPING ===\n${extractRowsForTeam(teamStatsMd, needles)}\n\nSource: ${urls.specialTeams}\n\n=== POWERPLAY / PENALTY KILLING ===\n${extractRowsForTeam(specialTeamsMd, needles)}\n\n=== LAST 5 PLAYED GAMES (most recent first; already filtered & sorted) ===\n${lastFiveMd}`;
}

async function fetchTeamShotsOnGoal(
  urls: Urls,
): Promise<Record<string, { sfPerGame: number | null; saPerGame: number | null }>> {
  // Invert the SHORT_NAMES map: abbreviation → full name
  // e.g. "GRÄ" → "Grästorps IK"
  const nameByAbbr: Record<string, string> = {};
  for (const name of KNOWN_TEAM_NAMES) {
    nameByAbbr[shortTeamName(name)] = name;
  }
  try {
    const res = await fetch(urls.teamStats, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    if (!res.ok) return {};
    const fullHtml = await res.text();

    // The page has two tables: Scoring Efficiency then Goalkeeping Efficiency.
    // Both have SOG at column index 5 — split on the first </table> boundary
    // after "Scoring Efficiency" so we never rely on the heading text of the
    // second section (which may have different casing or spacing in raw HTML).
    const scoringStart = fullHtml.indexOf("Scoring Efficiency");
    const afterScoring = scoringStart >= 0 ? fullHtml.slice(scoringStart) : fullHtml;
    const firstTableEnd = afterScoring.search(/<\/table>/i);

    const scoringHtml =
      firstTableEnd >= 0 ? afterScoring.slice(0, firstTableEnd) : afterScoring;
    const keepingHtml =
      firstTableEnd >= 0 ? afterScoring.slice(firstTableEnd) : "";

    function parseTable(
      html: string,
      // Scoring Efficiency: Rk(0) Team(1) GP(2) GF(3) SSG(4) SOG(5) GFA(6) SG%(7)
      // Goalkeeping Efficiency: Rk(0) Team(1) GP(2) GA(3) SSG(4) SOA(5) GAA(6) SV%(7)
      // Column layout is identical — SOG/SOA always at index 5
    ): Record<string, number> {
      const out: Record<string, number> = {};
      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(html)) !== null) {
        const cells = extractTdCells(rowMatch[1]);
        if (cells.length < 6) continue;
        const fullName = nameByAbbr[cells[1]];
        if (!fullName) continue;
        const gp = Number(cells[2]);
        const sog = Number(cells[5]);
        if (!Number.isFinite(gp) || gp === 0 || !Number.isFinite(sog) || sog <= 0) continue;
        out[fullName] = sog / gp;
      }
      return out;
    }

    const sfByName = parseTable(scoringHtml);
    const saByName = parseTable(keepingHtml);

    const result: Record<string, { sfPerGame: number | null; saPerGame: number | null }> = {};
    const allNames = new Set([...Object.keys(sfByName), ...Object.keys(saByName)]);
    for (const name of allNames) {
      result[name] = {
        sfPerGame: sfByName[name] ?? null,
        saPerGame: saByName[name] ?? null,
      };
    }
    return result;
  } catch (err) {
    console.warn("[teamStats:SOG] fetch failed:", (err as Error).message);
    return {};
  }
}

export async function buildBriefing(
  home: string,
  away: string,
  season: Season = DEFAULT_SEASON,
  force = false,
): Promise<Briefing> {
  const urls = buildUrls(season.competitionId);

  // Fetch the schedule ONCE (memoized via getScheduleGames/scheduleCache),
  // Firecrawl pages, team code map, AND the scoring page (which feeds
  // top scorers, goalies, AND discipline in one HTTP request via
  // fetchScoringPageData — previously those three fetched urls.scoring
  // independently, up to three times per buildBriefing call).
  // `force` also busts the in-process schedule cache: without it, a
  // force-refreshed briefing could still read a schedule fetched hours ago
  // earlier in the process's lifetime, silently missing newly played games.
  //
  // getScheduleGames and scrapeMd are the only two entries here that can
  // reject (every other fetcher already degrades to an empty result
  // internally) — if the schedule page is down, catch and degrade those two
  // as well so one unreachable source doesn't fail the entire briefing when
  // special teams / scoring / shots-on-goal fetched fine.
 const [scheduleGames, scheduleMd, specialTeamsByName, codeMap, scoringData, sogByName] =
    await Promise.all([
      getScheduleGames(season, { force }).catch((err) => {
        console.warn("[buildBriefing] schedule fetch failed, degrading gracefully:", (err as Error).message);
        return [] as ScheduleGame[];
      }),
      scrapeMd(urls.schedule).catch((err) => {
        console.warn("[buildBriefing] schedule markdown fetch failed, degrading gracefully:", (err as Error).message);
        return "";
      }),
      fetchSpecialTeamsFromHtml(urls),
      fetchTeamCodeMap(urls),
      fetchScoringPageData(urls),
      fetchTeamShotsOnGoal(urls),
    ]);

  const homeCode = codeMap[home];
  const awayCode = codeMap[away];
  console.log(`[briefing] ${home} -> ${homeCode}, ${away} -> ${awayCode}`);

  const parsedHomeLast5 = parseLastFiveGames(scheduleMd, home);
  const parsedAwayLast5 = parseLastFiveGames(scheduleMd, away);
  const homeSpecialTeams = pickSpecialTeams(specialTeamsByName, home);
  const awaySpecialTeams = pickSpecialTeams(specialTeamsByName, away);


  const emptyTeam = (name: string): Briefing["home"] => ({
    name,
    position: null,
    points: null,
    gamesPlayed: null,
    lastFive: [],
    topScorers: [],
    powerPlayPct: null,
    penaltyKillPct: null,
    powerPlayGoals: null,
    penaltyKillGoalsAgainst: null,
    venueForm: null,
    periodGoals: null,
    goalies: [],
    hotPlayer: null,
    discipline: null,
    faceoffs: null,
    shotsForPerGame: null,
    shotsAgainstPerGame: null,
  });

  const object: Briefing = {
    league: "HockeyEttan Södra",
    home: emptyTeam(home),
    away: emptyTeam(away),
    headToHead: await enrichH2HWithGameIds(parseHeadToHead(scheduleMd, home, away), season),
    notes: "",
  };

  object.home.lastFive = parsedHomeLast5;
  object.away.lastFive = parsedAwayLast5;
  object.home.powerPlayPct = homeSpecialTeams.powerPlayPct;
  object.home.penaltyKillPct = homeSpecialTeams.penaltyKillPct;
  object.home.powerPlayGoals = homeSpecialTeams.powerPlayGoals;
  object.home.penaltyKillGoalsAgainst = homeSpecialTeams.penaltyKillGoalsAgainst;
  object.away.powerPlayPct = awaySpecialTeams.powerPlayPct;
  object.away.penaltyKillPct = awaySpecialTeams.penaltyKillPct;
  object.away.powerPlayGoals = awaySpecialTeams.powerPlayGoals;
  object.away.penaltyKillGoalsAgainst = awaySpecialTeams.penaltyKillGoalsAgainst;

  // Venue form and period goals from the shared schedule games — no network call.
  const emptyVenueForm = (): VenueForm => ({
    home: { results: [], streak: null },
    away: { results: [], streak: null },
  });
  const venueByName = computeVenueForm(scheduleGames, [home, away]);
  object.home.venueForm = venueByName[home] ?? emptyVenueForm();
  object.away.venueForm = venueByName[away] ?? emptyVenueForm();

  const periodGoalsByName = computePeriodGoals(scheduleGames, [home, away]);
  object.home.periodGoals = periodGoalsByName[home] ?? null;
  object.away.periodGoals = periodGoalsByName[away] ?? null;

  // Goalies, top scorers (fallback), and discipline all come from the single
  // fetchScoringPageData call above — urls.scoring fetched exactly once.
  object.home.goalies = scoringData.goalies[home] ?? [];
  object.away.goalies = scoringData.goalies[away] ?? [];
  object.home.discipline = scoringData.discipline[home] ?? null;
  object.away.discipline = scoringData.discipline[away] ?? null;
  object.home.faceoffs = scoringData.faceoffs[home] ?? null;
  object.away.faceoffs = scoringData.faceoffs[away] ?? null;
  object.home.shotsForPerGame = sogByName[home]?.sfPerGame ?? null;
  object.away.shotsForPerGame = sogByName[away]?.sfPerGame ?? null;
  object.home.shotsAgainstPerGame = sogByName[home]?.saPerGame ?? null;
  object.away.shotsAgainstPerGame = sogByName[away]?.saPerGame ?? null;

  // Hot players from individual game event pages.
  const hotPlayerStarted = Date.now();
  const hotByName = await fetchHotPlayersFromGameLogs(urls, [
    { name: home, code: homeCode },
    { name: away, code: awayCode },
  ]);
  object.home.hotPlayer = hotByName[home] ?? null;
  object.away.hotPlayer = hotByName[away] ?? null;
  console.log(
    `[hotPlayer] done in ${Date.now() - hotPlayerStarted}ms — home=${object.home.hotPlayer?.name ?? "none"} away=${object.away.hotPlayer?.name ?? "none"}`,
  );

  // Fallback pass: fill any fields still null/empty after the primary parse.
  // last-five uses computeLastFive (no network); standings and PP/PK hit their
  // respective pages only when needed; top scorers fall back to scoringData
  // (already fetched above) before touching the network.
  const ppPkMissing =
    object.home.powerPlayPct == null ||
    object.home.penaltyKillPct == null ||
    object.away.powerPlayPct == null ||
    object.away.penaltyKillPct == null;
  const standingsMissing = (team: Briefing["home"]) =>
    team.position == null || team.points == null || team.gamesPlayed == null;
  const standingsNeeded = standingsMissing(object.home) || standingsMissing(object.away);
  const topScorersNeeded =
    object.home.topScorers.length === 0 || object.away.topScorers.length === 0;
  const lastFiveNeeded =
    object.home.lastFive.length === 0 || object.away.lastFive.length === 0;

  type FieldKey =
    | "position"
    | "points"
    | "gamesPlayed"
    | "powerPlayPct"
    | "penaltyKillPct"
    | "topScorers"
    | "lastFive";
  const missingBefore = (team: Briefing["home"]): Set<FieldKey> => {
    const set = new Set<FieldKey>();
    if (team.position == null) set.add("position");
    if (team.points == null) set.add("points");
    if (team.gamesPlayed == null) set.add("gamesPlayed");
    if (team.powerPlayPct == null) set.add("powerPlayPct");
    if (team.penaltyKillPct == null) set.add("penaltyKillPct");
    if (team.topScorers.length === 0) set.add("topScorers");
    if (team.lastFive.length === 0) set.add("lastFive");
    return set;
  };
  const homeMissing = missingBefore(object.home);
  const awayMissing = missingBefore(object.away);
  console.log(
    `[fallback] needed: pp/pk=${ppPkMissing} standings=${standingsNeeded} topScorers=${topScorersNeeded} lastFive=${lastFiveNeeded}`,
  );
  console.log(
    `[fallback] missing before — ${home}: [${[...homeMissing].join(", ") || "none"}]; ${away}: [${[...awayMissing].join(", ") || "none"}]`,
  );

  // Top scorers fallback uses the already-fetched scoringData — no extra fetch.
  // Only PP/PK and standings need their own pages when missing.
  const fetchStarted = Date.now();
  const [ppByName, standingsByName, lastFiveByName] = await Promise.all([
    ppPkMissing
      ? fetchSpecialTeamsFromHtml(urls).then((fresh) => ({ ...specialTeamsByName, ...fresh }))
      : Promise.resolve({} as Record<string, SpecialTeamsEntry>),

    standingsNeeded
      ? fetchStandingsFromHtml(urls)
      : Promise.resolve({} as Record<string, { position: number | null; gamesPlayed: number | null; points: number | null }>),
    lastFiveNeeded
      ? Promise.resolve(computeLastFive(scheduleGames, [home, away]))
      : Promise.resolve({} as Record<string, Briefing["home"]["lastFive"]>),
  ]);
  const fetchMs = Date.now() - fetchStarted;
  console.log(
    `[fallback] fetches done in ${fetchMs}ms — pp/pk=${Object.keys(ppByName).length} standings=${Object.keys(standingsByName).length}`,
  );

  type FilledEntry = { field: FieldKey; source: string };
  const metrics: Record<
    string,
    { filled: FilledEntry[]; failed: FieldKey[]; sourceMatched: Record<string, boolean> }
  > = {};

  const apply = (team: Briefing["home"], name: string, wasMissing: Set<FieldKey>) => {
    const filled: FilledEntry[] = [];
    const sourceMatched = {
      ppPk: name in ppByName,
      standings: name in standingsByName,
      topScorers: name in scoringData.topScorers,
      lastFive: name in lastFiveByName,
    };

    const pp = pickSpecialTeams(ppByName, name);
    if (pp) {
      if (team.powerPlayPct == null && pp.powerPlayPct != null) {
        team.powerPlayPct = pp.powerPlayPct;
        filled.push({ field: "powerPlayPct", source: "ppPk" });
      }
      if (team.penaltyKillPct == null && pp.penaltyKillPct != null) {
        team.penaltyKillPct = pp.penaltyKillPct;
        filled.push({ field: "penaltyKillPct", source: "ppPk" });
      }
    }
    const st = standingsByName[name];
    if (st) {
      if (team.position == null && st.position != null) {
        team.position = st.position;
        filled.push({ field: "position", source: "standings" });
      }
      if (team.points == null && st.points != null) {
        team.points = st.points;
        filled.push({ field: "points", source: "standings" });
      }
      if (team.gamesPlayed == null && st.gamesPlayed != null) {
        team.gamesPlayed = st.gamesPlayed;
        filled.push({ field: "gamesPlayed", source: "standings" });
      }
    }
    // Top scorers fallback: read from already-fetched scoringData — free.
    if (team.topScorers.length === 0) {
      const sc = scoringData.topScorers[name];
      if (sc && sc.length > 0) {
        team.topScorers = sc;
        filled.push({ field: "topScorers", source: "scoringData" });
      }
    }
    const lf = lastFiveByName[name];
    if (lf && team.lastFive.length === 0) {
      team.lastFive = lf;
      filled.push({ field: "lastFive", source: "lastFive" });
    }

    const stillMissing = missingBefore(team);
    const failed = [...wasMissing].filter((f) => stillMissing.has(f));
    metrics[name] = { filled, failed, sourceMatched };
    if (filled.length > 0) {
      console.log(`[fallback] FILLED ${name}: ${filled.map((f) => f.field).join(", ")}`);
    }
    if (failed.length > 0) {
      console.warn(
        `[fallback] STILL MISSING ${name}: ${failed.join(", ")} (sources matched: ${JSON.stringify(sourceMatched)})`,
      );
    }
  };
  apply(object.home, home, homeMissing);
  apply(object.away, away, awayMissing);

  const filledHome = metrics[home].filled.map((f) => f.field);
  const filledAway = metrics[away].filled.map((f) => f.field);
  const totalFilled = filledHome.length + filledAway.length;
  const totalFailed = metrics[home].failed.length + metrics[away].failed.length;
  console.log(
    `[fallback-metrics] ${JSON.stringify({
      matchup: `${home} vs ${away}`,
      fetchMs,
      sourcesAttempted: { ppPk: ppPkMissing, standings: standingsNeeded, topScorers: topScorersNeeded, lastFive: lastFiveNeeded },
      missingBefore: { home: [...homeMissing], away: [...awayMissing] },
      filled: { home: filledHome, away: filledAway },
      failed: { home: metrics[home].failed, away: metrics[away].failed },
      totals: { filled: totalFilled, failed: totalFailed },
    })}`,
  );

  // Persist fallback quality events to Supabase.
  const matchupLabel = `${home} vs ${away}`;
  const events: Array<{
    matchup: string;
    home_team: string;
    away_team: string;
    field_name: string;
    team_side: string;
    status: string;
    source: string | null;
  }> = [];
  for (const [side, teamName] of [["home", home], ["away", away]] as const) {
    for (const entry of metrics[teamName].filled) {
      events.push({
        matchup: matchupLabel,
        home_team: home,
        away_team: away,
        field_name: entry.field,
        team_side: side,
        status: "filled",
        source: entry.source,
      });
    }
    for (const field of metrics[teamName].failed) {
      events.push({
        matchup: matchupLabel,
        home_team: home,
        away_team: away,
        field_name: field,
        team_side: side,
        status: "failed",
        source: null,
      });
    }
  }
  if (events.length > 0) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("fallback_events").insert(events);
      if (error) {
        console.warn(`[fallback] failed to persist events: ${error.message}`);
      } else {
        console.log(`[fallback] persisted ${events.length} event(s) to fallback_events`);
      }
    } catch (e) {
      console.warn(`[fallback] persist error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return object;
}

export type { Briefing };
export { z };

export async function findMatchupOnDate(
  season: Season,
  dateISO: string,
): Promise<{ date: string; home: string; away: string } | null> {
  try {
    const urls = buildUrls(season.competitionId);
    const res = await fetch(urls.schedule, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
    const matchupRe = /^(.+?)\s+-\s+(.+?)$/;
    const scoreRe = /^\d+\s*-\s*\d+$/;
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let currentDate = "";
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const rowText = rowMatch[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "|")
        .replace(/&nbsp;|\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
      const dm = rowText.match(dateRe);
      if (dm) currentDate = dm[1];
      if (currentDate !== dateISO) continue;
      const cells = rowText.split("|").map((s) => s.trim()).filter(Boolean);
      const matchupCell = cells.find(
        (c) => matchupRe.test(c) && !scoreRe.test(c) && !dateRe.test(c),
      );
      if (!matchupCell) continue;
      const teams = matchupCell.match(matchupRe);
      if (!teams) continue;
      return { date: currentDate, home: teams[1].trim(), away: teams[2].trim() };
    }
    return null;
  } catch (err) {
    console.warn("[todaysMatchup] failed:", (err as Error).message);
    return null;
  }
}

// ---------- Historical depth helpers ----------

export type ScheduleGame = {
  id: string | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  periodCount: number;
  periods: Array<[number, number]>;
  played: boolean;
};

async function fetchAllScheduleGames(urls: Urls): Promise<ScheduleGame[]> {
  const res = await fetch(urls.schedule, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  const html = await res.text();
  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
  const matchupRe = /^(.+?)\s+-\s+(.+?)$/;
  const scoreRe = /^(\d+)\s*-\s*(\d+)$/;
  const periodsRe = /\(([\d\s,\-]+)\)/;
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const games: ScheduleGame[] = [];
  let currentDate = "";
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const raw = rm[1];
    const gidMatch = raw.match(/\/Game\/Events\/(\d+)/);
    const rowText = raw
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "|")
      .replace(/&nbsp;|\u00a0/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    const dm = rowText.match(dateRe);
    if (dm) currentDate = dm[1];
    if (!currentDate) continue;
    const cells = rowText.split("|").map((s) => s.trim()).filter(Boolean);
    const matchupCell = cells.find(
      (c) => matchupRe.test(c) && !scoreRe.test(c) && !dateRe.test(c),
    );
    if (!matchupCell) continue;
    const teams = matchupCell.match(matchupRe);
    if (!teams) continue;
    const scoreCell = cells.find((c) => scoreRe.test(c));
    const score = scoreCell?.match(scoreRe) ?? null;
    const periodsCell = cells.find((c) => periodsRe.test(c)) ?? "";
    const pairs = periodsCell.match(/\d+\s*-\s*\d+/g) ?? [];
    const periodCount = pairs.length;
    const periods: Array<[number, number]> = pairs.map((p) => {
      const m = p.match(/(\d+)\s*-\s*(\d+)/)!;
      return [Number(m[1]), Number(m[2])];
    });
    games.push({
      id: gidMatch?.[1] ?? null,
      date: currentDate,
      homeTeam: teams[1].trim(),
      awayTeam: teams[2].trim(),
      homeGoals: score ? Number(score[1]) : null,
      awayGoals: score ? Number(score[2]) : null,
      periodCount,
      periods,
      played: !!score,
    });
  }
  return games;
}

// Matches CACHE_TTL_MS in stats.functions.ts — the schedule shouldn't outlive
// the briefing cache layer that sits on top of it, or a "stale schedule" can
// survive a force-refreshed briefing indefinitely (see getScheduleGames below).
const SCHEDULE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type ScheduleCacheEntry = { promise: Promise<ScheduleGame[]>; fetchedAt: number };
const scheduleCache = new Map<string, ScheduleCacheEntry>();

export function getScheduleGames(
  season: Season,
  opts: { force?: boolean } = {},
): Promise<ScheduleGame[]> {
  const key = season.competitionId;
  const existing = scheduleCache.get(key);
  const isStale = existing != null && Date.now() - existing.fetchedAt > SCHEDULE_CACHE_TTL_MS;
  if (existing && !opts.force && !isStale) return existing.promise;

  const promise = fetchAllScheduleGames(buildUrls(key)).catch((err) => {
    scheduleCache.delete(key);
    throw err;
  });
  scheduleCache.set(key, { promise, fetchedAt: Date.now() });
  return promise;
}

export type AllTimeH2H = {
  totals: { wins: number; ties: number; losses: number; otWins: number; otLosses: number };
  atHome: { wins: number; ties: number; losses: number };
  atAway: { wins: number; ties: number; losses: number };
  meetings: number;
  seasonsCovered: { count: number; from: string | null; to: string | null };
};

export async function computeAllTimeHeadToHead(
  home: string,
  away: string,
): Promise<AllTimeH2H> {
  const { getMergedSeasons } = await import("./seasons.server");
  const seasons = await getMergedSeasons();
  let wins = 0, ties = 0, losses = 0, otWins = 0, otLosses = 0, meetings = 0;
  const atHome = { wins: 0, ties: 0, losses: 0 };
  const atAway = { wins: 0, ties: 0, losses: 0 };
  const seasonLabels = new Set<string>();
  await Promise.all(
    seasons.map(async (s) => {
      try {
        const games = await getScheduleGames(s);
        const matchups = games.filter(
          (g) =>
            g.played &&
            ((g.homeTeam === home && g.awayTeam === away) ||
              (g.homeTeam === away && g.awayTeam === home)),
        );
        if (matchups.length > 0) seasonLabels.add(s.label);
        for (const g of matchups) {
          meetings += 1;
          const isHome = g.homeTeam === home;
          const teamGoals = isHome ? g.homeGoals! : g.awayGoals!;
          const oppGoals = isHome ? g.awayGoals! : g.homeGoals!;
          const wentBeyond = g.periodCount > 3;
          const bucket = isHome ? atHome : atAway;
          if (teamGoals === oppGoals) { ties += 1; bucket.ties += 1; }
          else if (teamGoals > oppGoals) {
            if (wentBeyond) otWins += 1; else wins += 1;
            bucket.wins += 1;
          } else {
            if (wentBeyond) otLosses += 1; else losses += 1;
            bucket.losses += 1;
          }
        }
      } catch (err) {
        console.warn(`[allTimeH2H] season ${s.label} failed:`, (err as Error).message);
      }
    }),
  );
  const sorted = [...seasonLabels].sort();
  return {
    totals: { wins, ties, losses, otWins, otLosses },
    atHome,
    atAway,
    meetings,
    seasonsCovered: { count: sorted.length, from: sorted[0] ?? null, to: sorted[sorted.length - 1] ?? null },
  };
}

export type LastMeetingRecap = {
  date: string;
  seasonLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  gameUrl: string;
  goals: Array<{
    teamCode: string;
    scorer: string;
    assists: string[];
    period: string | null;
    time: string | null;
  }>;
  wentToOvertime: boolean;
  wentToShootout: boolean;
  homeShots: number | null;
  awayShots: number | null;
  homePim: number | null;
  awayPim: number | null;
};

export async function fetchLastMeetingRecap(
  home: string,
  away: string,
): Promise<LastMeetingRecap | null> {
  const { getMergedSeasons } = await import("./seasons.server");
  const seasons = await getMergedSeasons();
  let meeting: { seasonLabel: string; g: ScheduleGame } | null = null;
  for (const s of seasons) {
    try {
      const games = await getScheduleGames(s);
      const candidates = games
        .filter(
          (g) =>
            g.played &&
            g.id &&
            ((g.homeTeam === home && g.awayTeam === away) ||
              (g.homeTeam === away && g.awayTeam === home)),
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      if (candidates.length > 0) {
        meeting = { seasonLabel: s.label, g: candidates[0] };
        break;
      }
    } catch (err) {
      console.warn(`[lastMeeting] season ${s.label} failed:`, (err as Error).message);
    }
  }
  if (!meeting) return null;
  const gameId = meeting.g.id!;
  const gameUrl = `${STATS_BASE_URL}/Game/Events/${gameId}`;
  const result: LastMeetingRecap = {
    date: meeting.g.date,
    seasonLabel: meeting.seasonLabel,
    homeTeam: meeting.g.homeTeam,
    awayTeam: meeting.g.awayTeam,
    homeGoals: meeting.g.homeGoals!,
    awayGoals: meeting.g.awayGoals!,
    gameUrl,
    goals: [],
    wentToOvertime: false,
    wentToShootout: false,
    homeShots: null,
    awayShots: null,
    homePim: null,
    awayPim: null,
  };
  try {
    const res = await fetch(gameUrl, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    const html = await res.text();
    const extractPair = (label: string): [number | null, number | null] => {
      const re = new RegExp(`${label}\\s*</td>\\s*<td[^>]*>\\s*<strong>\\s*(\\d+)\\s*</strong>`, "gi");
      const out: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) out.push(parseInt(m[1], 10));
      return [out[0] ?? null, out[1] ?? null];
    };
    [result.homeShots, result.awayShots] = extractPair("Shots");
    [result.homePim, result.awayPim] = extractPair("PIM");
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const namePartRe = /\d+\.\s*([^<(]+?)(?=\s*<|\s*\(|$)/;
    const cleanName = (s: string) =>
      s.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
    const stripTags = (s: string) =>
      s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|\u00a0/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const headerToPeriod = (s: string): string | null => {
      const t = s.toLowerCase();
      if (/1st\s*period|första/.test(t)) return "1";
      if (/2nd\s*period|andra/.test(t)) return "2";
      if (/3rd\s*period|tredje/.test(t)) return "3";
      if (/overtime|över?tid|extra/.test(t)) return "OT";
      if (/shoot.?out|game winning shots|straff/.test(t)) return "SO";
      return null;
    };
    let currentPeriod: string | null = null;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(html)) !== null) {
      const row = tr[1];
      const h3 = row.match(/<h3>([^<]+)<\/h3>/i);
      if (h3) {
        const p = headerToPeriod(h3[1]);
        if (p) {
          currentPeriod = p;
          if (p === "OT") result.wentToOvertime = true;
          if (p === "SO") result.wentToShootout = true;
        }
        continue;
      }
      if (!/Total goals scored/i.test(row)) continue;
      const cells = row.split(/<\/td>/i);
      if (cells.length < 4) continue;
      const time = stripTags(cells[0]) || null;
      const teamCode = stripTags(cells[2]);
      if (!/^[A-ZÅÄÖ]{2,4}$/.test(teamCode)) continue;
      const scorerCell = cells[3];
      const beforeSpan = scorerCell.split(/<span/i)[0];
      const scorerM = beforeSpan.match(namePartRe);
      if (!scorerM) continue;
      const scorer = cleanName(scorerM[1]);
      const assists: string[] = [];
      const assistRe = /Assists in tournament[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      let am: RegExpExecArray | null;
      while ((am = assistRe.exec(scorerCell)) !== null) {
        const inner = am[1].replace(/<[^>]+>/g, "");
        const nm = inner.match(namePartRe);
        if (nm) assists.push(cleanName(nm[1]));
      }
      result.goals.push({ teamCode, scorer, assists, period: currentPeriod, time });
    }
    const periodRank: Record<string, number> = { "1": 1, "2": 2, "3": 3, OT: 4, SO: 5 };
    const toSec = (t: string | null) => {
      if (!t) return 0;
      const m = t.match(/^(\d+):(\d+)/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
    };
    result.goals.sort((a, b) => {
      const pa = periodRank[a.period ?? ""] ?? 99;
      const pb = periodRank[b.period ?? ""] ?? 99;
      if (pa !== pb) return pa - pb;
      return toSec(a.time) - toSec(b.time);
    });
  } catch (err) {
    console.warn(`[lastMeeting] event page failed:`, (err as Error).message);
  }
  return result;
}

export type SeasonTrajectory = {
  team: string;
  seasonLabel: string;
  points: Array<{
    gameNumber: number;
    date: string;
    rollingPpg: number;
    cumulativePpg: number;
  }>;
  leagueAveragePpg: number | null;
};

function pointsForResult(teamGoals: number, oppGoals: number, wentBeyond: boolean): number {
  if (teamGoals === oppGoals) return 1;
  if (teamGoals > oppGoals) return wentBeyond ? 2 : 3;
  return wentBeyond ? 1 : 0;
}

export async function fetchSeasonTrajectory(
  team: string,
  season: Season,
): Promise<SeasonTrajectory> {
  const games = await getScheduleGames(season);
  const teamGames = games
    .filter((g) => g.played && (g.homeTeam === team || g.awayTeam === team))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const windowSize = 5;
  const recent: number[] = [];
  let cumulative = 0;
  const points: SeasonTrajectory["points"] = [];
  teamGames.forEach((g, idx) => {
    const isHome = g.homeTeam === team;
    const tg = isHome ? g.homeGoals! : g.awayGoals!;
    const og = isHome ? g.awayGoals! : g.homeGoals!;
    const wentBeyond = g.periodCount > 3;
    const pts = pointsForResult(tg, og, wentBeyond);
    cumulative += pts;
    recent.push(pts);
    if (recent.length > windowSize) recent.shift();
    const rolling = recent.reduce((a, b) => a + b, 0) / recent.length;
    points.push({
      gameNumber: idx + 1,
      date: g.date,
      rollingPpg: Number(rolling.toFixed(3)),
      cumulativePpg: Number((cumulative / (idx + 1)).toFixed(3)),
    });
  });
  let totalPts = 0;
  let totalSlots = 0;
  for (const g of games) {
    if (!g.played) continue;
    const wentBeyond = g.periodCount > 3;
    const hg = g.homeGoals!;
    const ag = g.awayGoals!;
    totalPts += pointsForResult(hg, ag, wentBeyond) + pointsForResult(ag, hg, wentBeyond);
    totalSlots += 2;
  }
  const leagueAveragePpg = totalSlots > 0 ? Number((totalPts / totalSlots).toFixed(3)) : null;
  return { team, seasonLabel: season.label, points, leagueAveragePpg };
}

// ---------- Full standings ----------

export type StandingRow = {
  position: number;
  team: string;
  gamesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  otWins: number;
  otLosses: number;
  logoCode?: string;
};

export async function fetchFullStandings(season: Season): Promise<StandingRow[]> {
  const urls = buildUrls(season.competitionId);
  const res = await fetch(urls.standings, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  const html = await res.text();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: StandingRow[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = extractTdCells(m[1]);
    if (cells.length < 11) continue;
    const position = Number(cells[0]);
    const team = cells[1];
    const gp = Number(cells[2]);
    const w = Number(cells[3]);
    const t = Number(cells[4]);
    const l = Number(cells[5]);
    const goalsCell = cells[6].replace(/\(.*\)/, "").trim();
    const [gfStr, gaStr] = goalsCell.split(":").map((s) => s.trim());
    const gf = Number(gfStr);
    const ga = Number(gaStr);
    const diff = Number(cells[7]);
    const pts = Number(cells[8]);
    const otw = Number(cells[9]);
    const otl = Number(cells[10]);
    if (!Number.isFinite(position) || !team || !Number.isFinite(gp) || !Number.isFinite(pts)) continue;
    if (seen.has(team)) continue;
    seen.add(team);
    rows.push({
      position,
      team,
      gamesPlayed: gp,
      wins: Number.isFinite(w) ? w : 0,
      ties: Number.isFinite(t) ? t : 0,
      losses: Number.isFinite(l) ? l : 0,
      goalsFor: Number.isFinite(gf) ? gf : 0,
      goalsAgainst: Number.isFinite(ga) ? ga : 0,
      goalDiff: Number.isFinite(diff) ? diff : 0,
      points: pts,
      otWins: Number.isFinite(otw) ? otw : 0,
      otLosses: Number.isFinite(otl) ? otl : 0,
    });
  }
  return rows.sort((a, b) => a.position - b.position);
}

// ---------- League-wide overview ----------

export type LeagueLeaderScorer = {
  rank: number; name: string; team: string;
  goals: number | null; assists: number | null;
  points: number; gamesPlayed: number | null;
};

export type LeagueLeaderGoalie = {
  rank: number; name: string; team: string;
  gamesPlayed: number; savePct: number | null;
  gaa: number | null; shutouts: number | null;
  wins: number | null; losses: number | null;
};

export type HottestTeam = {
  rank: number; team: string; points: number;
  results: Array<"W" | "OTW" | "T" | "OTL" | "L">;
  goalsFor: number; goalsAgainst: number;
};

export type ScoringTeam = {
  rank: number; team: string; gamesPlayed: number;
  goalsFor: number; goalsAgainst: number; perGame: number;
};

export type LeagueOverview = {
  seasonLabel: string;
  topScorers: LeagueLeaderScorer[];
  topGoalies: LeagueLeaderGoalie[];
  hottestTeams: HottestTeam[];
  highestScoring: ScoringTeam[];
  bestDefenses: ScoringTeam[];
};

export async function fetchLeagueOverview(season: Season): Promise<LeagueOverview> {
  const urls = buildUrls(season.competitionId);
  // fetchScoringPageData already parses top scorers and goalies from one fetch
  // of urls.scoring — reuse it here to avoid a separate fetch for the overview.
  const [scoringData, standings, games] = await Promise.all([
    fetchScoringPageData(urls),
    fetchFullStandings(season),
    getScheduleGames(season).catch(() => [] as ScheduleGame[]),
  ]);

  const flatScorers: LeagueLeaderScorer[] = [];
  for (const [team, list] of Object.entries(scoringData.topScorers)) {
    for (const s of list) {
      flatScorers.push({
        rank: 0, name: s.name, team,
        goals: s.goals ?? null, assists: s.assists ?? null,
        points: s.points ?? 0, gamesPlayed: s.gamesPlayed ?? null,
      });
    }
  }
  flatScorers.sort((a, b) => b.points - a.points || (b.goals ?? 0) - (a.goals ?? 0));
  const topScorers = flatScorers.slice(0, 10).map((s, i) => ({ ...s, rank: i + 1 }));

  const flatGoalies: LeagueLeaderGoalie[] = [];
  for (const [team, list] of Object.entries(scoringData.goalies)) {
    for (const g of list) {
      if ((g.gamesPlayed ?? 0) < 5) continue;
      flatGoalies.push({
        rank: 0, name: g.name, team,
        gamesPlayed: g.gamesPlayed ?? 0, savePct: g.savePct ?? null,
        gaa: g.gaa ?? null, shutouts: g.shutouts ?? null,
        wins: g.wins ?? null, losses: g.losses ?? null,
      });
    }
  }
  flatGoalies.sort((a, b) => (b.savePct ?? -Infinity) - (a.savePct ?? -Infinity));
  const topGoalies = flatGoalies.slice(0, 10).map((g, i) => ({ ...g, rank: i + 1 }));

  const byTeam = new Map<string, ScheduleGame[]>();
  for (const g of games) {
    if (!g.played) continue;
    for (const team of [g.homeTeam, g.awayTeam]) {
      const arr = byTeam.get(team) ?? [];
      arr.push(g);
      byTeam.set(team, arr);
    }
  }
  const hot: HottestTeam[] = [];
  for (const [team, list] of byTeam) {
    const last5 = [...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
    if (last5.length < 3) continue;
    let pts = 0, gf = 0, ga = 0;
    const results: HottestTeam["results"] = [];
    for (const g of last5) {
      const isHome = g.homeTeam === team;
      const tg = (isHome ? g.homeGoals : g.awayGoals) ?? 0;
      const og = (isHome ? g.awayGoals : g.homeGoals) ?? 0;
      gf += tg; ga += og;
      const beyond = g.periodCount > 3;
      if (tg === og) { pts += 1; results.push("T"); }
      else if (tg > og) { if (beyond) { pts += 2; results.push("OTW"); } else { pts += 3; results.push("W"); } }
      else { if (beyond) { pts += 1; results.push("OTL"); } else { results.push("L"); } }
    }
    hot.push({ rank: 0, team, points: pts, results, goalsFor: gf, goalsAgainst: ga });
  }
  hot.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
  const hottestTeams = hot.slice(0, 5).map((h, i) => ({ ...h, rank: i + 1 }));

  const scoringRows: ScoringTeam[] = standings
    .filter((r) => r.gamesPlayed > 0)
    .map((r) => ({
      rank: 0, team: r.team, gamesPlayed: r.gamesPlayed,
      goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
      perGame: r.goalsFor / r.gamesPlayed,
    }));
  const highestScoring = [...scoringRows]
    .sort((a, b) => b.perGame - a.perGame)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const bestDefenses = [...scoringRows]
    .sort((a, b) => a.goalsAgainst / a.gamesPlayed - b.goalsAgainst / b.gamesPlayed)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1, perGame: r.goalsAgainst / r.gamesPlayed }));

  return { seasonLabel: season.label, topScorers, topGoalies, hottestTeams, highestScoring, bestDefenses };
}

// ---------- League-wide players (/spelare) ----------

export type LeaguePlayerRow = {
  team: string; name: string; position: string;
  gamesPlayed: number | null; goals: number | null;
  assists: number | null; points: number | null; pim: number | null;
};

export async function fetchAllLeaguePlayers(season: Season): Promise<LeaguePlayerRow[]> {
  const urls = buildUrls(season.competitionId);
  const res = await fetch(urls.scoring, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTPError ${res.status} ${urls.scoring}`);
  const html = await res.text();
  const anchorRe = /<a\s+id="([^"]+)">\s*<\/a>/g;
  const anchors: Array<{ name: string; index: number }> = [];
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(html)) !== null) {
    anchors.push({ name: am[1], index: am.index });
  }
  const out: LeaguePlayerRow[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const team = anchors[i].name;
    const start = anchors[i].index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
    const fullSection = html.slice(start, end);
    const gkIdx = fullSection.search(/Goalkeeping Statistics/i);
    const skaterSection = gkIdx === -1 ? fullSection : fullSection.slice(0, gkIdx);
    const gkSection = gkIdx === -1 ? "" : fullSection.slice(gkIdx);
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(skaterSection)) !== null) {
      const cells = extractTdCells(rowMatch[1]);
      if (cells.length < 9) continue;
      const rank = Number(cells[0]);
      if (!Number.isFinite(rank)) continue;
      const name = cells[2];
      if (!name) continue;
      const pos = (cells[3] || "").trim() || "F";
      const gp = Number(cells[4]);
      const g = Number(cells[5]);
      const a = Number(cells[6]);
      const p = Number(cells[7]);
      const pim = Number(cells[8]);
      out.push({
        team, name, position: pos,
        gamesPlayed: Number.isFinite(gp) ? gp : null,
        goals: Number.isFinite(g) ? g : null,
        assists: Number.isFinite(a) ? a : null,
        points: Number.isFinite(p) ? p : null,
        pim: Number.isFinite(pim) ? pim : null,
      });
    }
    if (gkSection) {
      const gkRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let gm: RegExpExecArray | null;
      while ((gm = gkRe.exec(gkSection)) !== null) {
        const cells = extractTdCells(gm[1]);
        if (cells.length < 15) continue;
        const name = cells[2];
        if (!name) continue;
        const gp = Number(cells[5]);
        if (!Number.isFinite(gp) || gp === 0) continue;
        out.push({ team, name, position: "G", gamesPlayed: gp, goals: null, assists: null, points: null, pim: null });
      }
    }
  }
  return out;
}
