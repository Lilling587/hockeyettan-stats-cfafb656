import { createClient } from "@supabase/supabase-js";
import type { Season } from "./seasons.config";
import { getScheduleGames } from "./stats.server";

const STATS_BASE_URL = "https://stats.swehockey.se";

function admin() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server env missing");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------- Types ----------

export type ParsedGamePage = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsByPeriod: number[]; // e.g. [20, 8, 13]
  awayShotsByPeriod: number[];
  homePim: number | null;
  awayPim: number | null;
  homePpPct: number | null; // as percent, e.g. 42.86
  awayPpPct: number | null;
  // Goals with strength info
  goals: Array<{
    teamCode: string;
    strength: "EV" | "PP" | "SH" | "EN" | "PS"; // even, powerplay, shorthanded, empty-net, penalty-shot
    scorer: string;
    assists: string[];
  }>;
  // Total counts derived from goals
  homePpGoals: number;
  awayPpGoals: number;
};

export type ParsedLineupPage = {
  gameId: string;
  // teamName -> array of player names "Lastname, Firstname"
  byTeam: Record<string, string[]>;
};

// ---------- In-memory coalescing ----------

const eventInflight = new Map<string, Promise<ParsedGamePage | null>>();
const lineupInflight = new Map<string, Promise<ParsedLineupPage | null>>();

// ---------- Persistent cache helpers ----------

async function readEventsCache(gameId: string): Promise<ParsedGamePage | null> {
  try {
    const { data } = await admin()
      .from("game_events_cache")
      .select("parsed")
      .eq("game_id", gameId)
      .maybeSingle();
    if (!data) return null;
    const parsed = data.parsed as unknown;
    if (parsed && typeof parsed === "object" && "gameId" in parsed) {
      return parsed as ParsedGamePage;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeEventsCache(
  gameId: string,
  seasonLabel: string,
  parsed: ParsedGamePage,
): Promise<void> {
  try {
    await admin()
      .from("game_events_cache")
      .upsert(
        {
          game_id: gameId,
          season: seasonLabel,
          parsed: parsed as unknown as object,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "game_id" },
      );
  } catch (err) {
    console.warn(`[game-flow] cache write failed: ${(err as Error).message}`);
  }
}

// ---------- Parsers ----------

function extractStrongPair(html: string, label: string): {
  a: number | null;
  b: number | null;
  aByPeriod: number[];
  bByPeriod: number[];
} {
  // Matches `<td...>${label}</td><td...><strong>NN</strong></td><td...>(x:y:z)</td>` blocks
  const re = new RegExp(
    `>\\s*${label}\\s*<\\/td>\\s*<td[^>]*>\\s*<strong>\\s*(\\d+(?:[.,]\\d+)?)\\s*<\\/strong>\\s*<\\/td>\\s*<td[^>]*>\\s*\\(([^)]*)\\)`,
    "gi",
  );
  const totals: number[] = [];
  const perPeriod: number[][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    totals.push(Number(m[1].replace(",", ".")));
    const parts = m[2].split(":").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    perPeriod.push(parts);
  }
  return {
    a: totals[0] ?? null,
    b: totals[1] ?? null,
    aByPeriod: perPeriod[0] ?? [],
    bByPeriod: perPeriod[1] ?? [],
  };
}

function extractPctPair(html: string, label: string): { a: number | null; b: number | null } {
  const re = new RegExp(
    `>\\s*${label}\\s*<\\/td>\\s*<td[^>]*>\\s*<strong>\\s*([\\d.,]+)\\s*%?\\s*<\\/strong>`,
    "gi",
  );
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(Number(m[1].replace(",", ".")));
  }
  return { a: out[0] ?? null, b: out[1] ?? null };
}

const namePartRe = /\d+\.\s*([^<(]+?)(?=\s*<|\s*\(|$)/;
const cleanName = (s: string) =>
  s.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();

function parseGoalsWithStrength(html: string): ParsedGamePage["goals"] {
  const goals: ParsedGamePage["goals"] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html)) !== null) {
    const row = tr[1];
    if (!/Total goals scored/i.test(row)) continue;
    const cells = row.split(/<\/td>/i);
    if (cells.length < 4) continue;
    const scoreCell = cells[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const teamCode = cells[2].replace(/<[^>]+>/g, "").trim();
    if (!/^[A-ZÅÄÖ]{2,4}$/.test(teamCode)) continue;
    let strength: ParsedGamePage["goals"][number]["strength"] = "EV";
    if (/\bPP\d?\b/i.test(scoreCell)) strength = "PP";
    else if (/\bSH\d?\b/i.test(scoreCell)) strength = "SH";
    else if (/\bEN\b/i.test(scoreCell)) strength = "EN";
    else if (/\bPS\b/i.test(scoreCell)) strength = "PS";
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
    goals.push({ teamCode, strength, scorer, assists });
  }
  return goals;
}

async function doFetchEventPage(
  gameId: string,
  seasonLabel: string,
): Promise<ParsedGamePage | null> {
  const cached = await readEventsCache(gameId);
  if (cached) return cached;

  const url = `${STATS_BASE_URL}/Game/Events/${gameId}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    html = await res.text();
    if (!html || html.length < 500) return null;
  } catch (err) {
    console.warn(`[game-flow] fetch ${gameId} failed: ${(err as Error).message}`);
    return null;
  }

  // Team names from <h2>Home - Away</h2>
  const titleMatch = html.match(/<h2>\s*([^<]+?)\s+-\s+([^<]+?)\s*<\/h2>/i);
  const homeTeam = titleMatch?.[1]?.trim() ?? "";
  const awayTeam = titleMatch?.[2]?.trim() ?? "";

  const shots = extractStrongPair(html, "Shots");
  const pim = extractStrongPair(html, "PIM");
  const pp = extractPctPair(html, "PP");
  const goals = parseGoalsWithStrength(html);

  // Team codes: the first goal row typically has home team code, but we need to
  // detect them from goals. In the events page, home team goals show as `X-Y`
  // where X increments for home. Simpler: figure out home code from the first
  // goal row for the home team (falling back to reading from the URL of the
  // team stats). For counting PP goals we split by teamCode; then map to
  // home/away by which one appears more often in the "home" section of the
  // page. As a robust heuristic, count both codes in the html; the one that
  // appears in more `class="linkNoDeco"...homeTeam` contexts is home. Simpler:
  // count PP goals by team code and match to whichever side has the higher
  // PP% in the summary, or leave counts per code. For dashboard we only need
  // home/away totals, so use the summary shots to know which pair is home
  // (first) and derive team codes from the two most common codes in goals.
  const codeCounts = new Map<string, number>();
  for (const g of goals) codeCounts.set(g.teamCode, (codeCounts.get(g.teamCode) ?? 0) + 1);
  const codes = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  // Detect home code from event page: the LineUp link section is followed by
  // the team blocks. As a safe heuristic, home code is the team whose first
  // scored goal (chronologically) matches the top of the running score. But
  // since we cannot know for sure without period parsing, and PP totals will
  // be split per code anyway, we resolve home/away by comparing goal counts
  // against the summary "6-4" final score.
  const finalMatch = html.match(/<div[^>]*>\s*(\d+)\s*-\s*(\d+)\s*<\/div>\s*<\/div>[\s\S]*?Final Score/i);
  const homeGoalsTotal = finalMatch ? Number(finalMatch[1]) : null;
  const awayGoalsTotal = finalMatch ? Number(finalMatch[2]) : null;

  let homeCode: string | null = null;
  let awayCode: string | null = null;
  if (codes.length >= 2 && homeGoalsTotal != null && awayGoalsTotal != null) {
    const c0 = codes[0];
    const c1 = codes[1];
    const goals0 = goals.filter((g) => g.teamCode === c0).length;
    const goals1 = goals.filter((g) => g.teamCode === c1).length;
    if (goals0 === homeGoalsTotal && goals1 === awayGoalsTotal) {
      homeCode = c0;
      awayCode = c1;
    } else if (goals1 === homeGoalsTotal && goals0 === awayGoalsTotal) {
      homeCode = c1;
      awayCode = c0;
    } else {
      // Fall back — pick by order but leave counts split
      homeCode = c0;
      awayCode = c1;
    }
  } else if (codes.length === 1) {
    homeCode = codes[0];
  }

  const homePpGoals = homeCode ? goals.filter((g) => g.teamCode === homeCode && g.strength === "PP").length : 0;
  const awayPpGoals = awayCode ? goals.filter((g) => g.teamCode === awayCode && g.strength === "PP").length : 0;

  const parsed: ParsedGamePage = {
    gameId,
    homeTeam,
    awayTeam,
    homeShots: shots.a,
    awayShots: shots.b,
    homeShotsByPeriod: shots.aByPeriod,
    awayShotsByPeriod: shots.bByPeriod,
    homePim: pim.a,
    awayPim: pim.b,
    homePpPct: pp.a,
    awayPpPct: pp.b,
    goals,
    homePpGoals,
    awayPpGoals,
  };

  await writeEventsCache(gameId, seasonLabel, parsed);
  return parsed;
}

export function fetchGameEventPage(
  gameId: string,
  seasonLabel: string,
): Promise<ParsedGamePage | null> {
  const existing = eventInflight.get(gameId);
  if (existing) return existing;
  const p = doFetchEventPage(gameId, seasonLabel).finally(() => {
    eventInflight.delete(gameId);
  });
  eventInflight.set(gameId, p);
  return p;
}

async function doFetchLineupPage(gameId: string): Promise<ParsedLineupPage | null> {
  const url = `${STATS_BASE_URL}/Game/LineUps/${gameId}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    html = await res.text();
    if (!html || html.length < 500) return null;
  } catch {
    return null;
  }

  // Split into per-team sections by <h3>TeamName (Red|White)
  const sectionRe = /<h3>\s*([^<(]+?)\s*\((?:Red|White)\)[\s\S]*?(?=<h3>\s*[^<(]+?\s*\(|<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*<\/div>)/gi;
  const byTeam: Record<string, string[]> = {};
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(html)) !== null) {
    const teamName = m[1].trim();
    const section = m[0];
    const players: string[] = [];
    const playerRe = /<div class="lineUpPlayer[^"]*">\s*\d+\.\s*([\s\S]*?)<\/div>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = playerRe.exec(section)) !== null) {
      const raw = pm[1].replace(/\s+/g, " ").trim();
      // Format: "Lastname, Firstname"
      if (raw) players.push(raw);
    }
    if (players.length > 0) byTeam[teamName] = players;
  }
  return { gameId, byTeam };
}

export function fetchLineupPage(gameId: string): Promise<ParsedLineupPage | null> {
  const existing = lineupInflight.get(gameId);
  if (existing) return existing;
  const p = doFetchLineupPage(gameId).finally(() => {
    lineupInflight.delete(gameId);
  });
  lineupInflight.set(gameId, p);
  return p;
}

// ---------- Aggregation ----------

export type GameFlowGamePoint = {
  gameId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  teamShots: number | null;
  oppShots: number | null;
  teamShotsByPeriod: number[];
  oppShotsByPeriod: number[];
  teamPim: number | null;
  oppPim: number | null;
  teamPpGoals: number;
  oppPpGoals: number;
  teamPpPct: number | null;
};

export type GameFlowResult = {
  team: string;
  seasonLabel: string;
  games: GameFlowGamePoint[]; // most recent first, up to N
  lineupDiff: {
    gameId: string | null;
    date: string | null;
    opponent: string | null;
    // Names on the current roster who did NOT play the last game
    missingFromLastGame: string[];
    // Names who played the last game but are not on the current roster listing
    playedButNotOnRoster: string[];
    rosterSize: number;
    playedCount: number;
    lineupAvailable: boolean;
  };
};

/**
 * Fetch a team's current roster names (Lastname, Firstname) from the
 * TeamRoster page for the given season, filtering to the section for `team`.
 */
async function fetchCurrentRoster(team: string, season: Season): Promise<string[]> {
  const url = `${STATS_BASE_URL}/Teams/Info/TeamRoster/${season.competitionId}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const html = await res.text();
    // Find the anchor <a id="TeamName"></a> and take everything until the next anchor
    const anchorRe = /<a\s+id="([^"]+)">\s*<\/a>/g;
    const anchors: Array<{ name: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html)) !== null) {
      anchors.push({ name: m[1], index: m.index });
    }
    const idx = anchors.findIndex((a) => a.name === team);
    if (idx === -1) return [];
    const start = anchors[idx].index;
    const end = idx + 1 < anchors.length ? anchors[idx + 1].index : html.length;
    const section = html.slice(start, end);
    // Roster rows: cells [rank, jersey, name, position, ...]
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const names: string[] = [];
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(section)) !== null) {
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        cells.push(
          cm[1]
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;|\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
      if (cells.length < 4) continue;
      const rank = Number(cells[0]);
      const name = cells[2];
      if (!Number.isFinite(rank) || !name || name.length < 3) continue;
      names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

const teamCache = new Map<string, Promise<GameFlowResult>>();
const TEAM_CACHE_TTL_MS = 30 * 60 * 1000;
const teamCacheAt = new Map<string, number>();

export function computeGameFlow(team: string, season: Season, n = 10): Promise<GameFlowResult> {
  const key = `${season.label}:${team}:${n}`;
  const at = teamCacheAt.get(key) ?? 0;
  if (Date.now() - at < TEAM_CACHE_TTL_MS) {
    const existing = teamCache.get(key);
    if (existing) return existing;
  }
  const p = doComputeGameFlow(team, season, n).finally(() => {
    teamCacheAt.set(key, Date.now());
  });
  teamCache.set(key, p);
  teamCacheAt.set(key, Date.now());
  return p;
}

async function doComputeGameFlow(
  team: string,
  season: Season,
  n: number,
): Promise<GameFlowResult> {
  const [scheduleGames, rosterNames] = await Promise.all([
    getScheduleGames(season),
    fetchCurrentRoster(team, season),
  ]);
  const teamGames = scheduleGames
    .filter((g) => g.played && g.id && (g.homeTeam === team || g.awayTeam === team))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n);

  const parsedList = await Promise.all(
    teamGames.map(async (g) => ({
      g,
      parsed: await fetchGameEventPage(g.id!, season.label),
    })),
  );

  const points: GameFlowGamePoint[] = parsedList.map(({ g, parsed }) => {
    const isHome = g.homeTeam === team;
    const opponent = isHome ? g.awayTeam : g.homeTeam;
    if (!parsed) {
      return {
        gameId: g.id!,
        date: g.date,
        opponent,
        isHome,
        teamShots: null,
        oppShots: null,
        teamShotsByPeriod: [],
        oppShotsByPeriod: [],
        teamPim: null,
        oppPim: null,
        teamPpGoals: 0,
        oppPpGoals: 0,
        teamPpPct: null,
      };
    }
    return {
      gameId: g.id!,
      date: g.date,
      opponent,
      isHome,
      teamShots: isHome ? parsed.homeShots : parsed.awayShots,
      oppShots: isHome ? parsed.awayShots : parsed.homeShots,
      teamShotsByPeriod: isHome ? parsed.homeShotsByPeriod : parsed.awayShotsByPeriod,
      oppShotsByPeriod: isHome ? parsed.awayShotsByPeriod : parsed.homeShotsByPeriod,
      teamPim: isHome ? parsed.homePim : parsed.awayPim,
      oppPim: isHome ? parsed.awayPim : parsed.homePim,
      teamPpGoals: isHome ? parsed.homePpGoals : parsed.awayPpGoals,
      oppPpGoals: isHome ? parsed.awayPpGoals : parsed.homePpGoals,
      teamPpPct: isHome ? parsed.homePpPct : parsed.awayPpPct,
    };
  });

  // Lineup diff for the most recent played game
  const lastGame = teamGames[0];
  const emptyDiff: GameFlowResult["lineupDiff"] = {
    gameId: null,
    date: null,
    opponent: null,
    missingFromLastGame: [],
    playedButNotOnRoster: [],
    rosterSize: rosterNames.length,
    playedCount: 0,
    lineupAvailable: false,
  };

  let lineupDiff = emptyDiff;
  if (lastGame && lastGame.id) {
    const lineup = await fetchLineupPage(lastGame.id);
    if (lineup) {
      // Find the team section by matching team name (case-insensitive)
      const key = Object.keys(lineup.byTeam).find(
        (k) => k.toLowerCase() === team.toLowerCase(),
      );
      const playedNames = key ? lineup.byTeam[key] : [];
      if (playedNames.length > 0) {
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
        const rosterSet = new Set(rosterNames.map(norm));
        const playedSet = new Set(playedNames.map(norm));
        const missing = rosterNames.filter((n) => !playedSet.has(norm(n)));
        const extra = playedNames.filter((n) => !rosterSet.has(norm(n)));
        lineupDiff = {
          gameId: lastGame.id,
          date: lastGame.date,
          opponent: lastGame.homeTeam === team ? lastGame.awayTeam : lastGame.homeTeam,
          missingFromLastGame: missing,
          playedButNotOnRoster: extra,
          rosterSize: rosterNames.length,
          playedCount: playedNames.length,
          lineupAvailable: true,
        };
      } else {
        lineupDiff = {
          ...emptyDiff,
          gameId: lastGame.id,
          date: lastGame.date,
          opponent: lastGame.homeTeam === team ? lastGame.awayTeam : lastGame.homeTeam,
        };
      }
    }
  }

  return {
    team,
    seasonLabel: season.label,
    games: points,
    lineupDiff,
  };
}
