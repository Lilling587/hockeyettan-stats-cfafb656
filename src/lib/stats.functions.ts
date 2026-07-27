import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_SEASON, getSeason, type Season } from "./seasons.config";

async function resolveSeason(label?: string | null): Promise<Season> {
  const fromConfig = getSeason(label);
  // If the label exists in config we still let DB overrides win (e.g. a
  // confirmed re-mapping). Always merge on every call so a freshly confirmed
  // season is immediately usable without restarting the app.
  if (!label) return fromConfig;
  try {
    const { getMergedSeasons } = await import("./seasons.server");
    const merged = await getMergedSeasons();
    return merged.find((s) => s.label === label) ?? fromConfig;
  } catch {
    return fromConfig;
  }
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const TEAMS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_VERSION = "v18";
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LEAGUE_SLUG = "hockeyettan-sodra";

type JsonPrimitive = string | number | boolean | null;

async function logAuditEvent(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  action: string,
  metadata?: Record<string, JsonPrimitive>,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("audit_events").insert({
      user_id: userId,
      action,
      metadata: metadata ?? null,
    });
  } catch {
    // Non-blocking — audit failures never break the main operation.
  }
}

function seasonCachePrefix(seasonLabel: string) {
  return `${seasonLabel}:${LEAGUE_SLUG}:${CACHE_VERSION}`;
}

// ---------- Schemas ----------

const GameResult = z.object({
  date: z.string().nullable().transform((v) => v ?? ""),
  opponent: z.string().nullable().transform((v) => v ?? ""),
  score: z.string().nullable().transform((v) => v ?? ""),
  result: z.enum(["W", "T", "L", "OTW", "OTL", "?"]).nullable().transform((v) => v ?? "?"),
  isHome: z.boolean().nullable().default(null),
});

const Scorer = z.object({
  name: z.string(),
  goals: z.number().nullable(),
  assists: z.number().nullable(),
  points: z.number().nullable(),
  gamesPlayed: z.number().nullable().default(null),
});

const VenueSplit = z.object({
  results: z
    .array(z.enum(["W", "T", "L", "OTW", "OTL"]))
    .describe("Most recent first; full season's played games at this venue"),
  streak: z
    .object({
      type: z.enum(["W", "T", "L"]),
      count: z.number().int().min(1),
    })
    .nullable(),
});

const PeriodGoals = z.object({
  p1: z.number().int().min(0),
  p2: z.number().int().min(0),
  p3: z.number().int().min(0),
  ot: z.number().int().min(0),
  total: z.number().int().min(0),
  games: z.number().int().min(0),
});

const Goalie = z.object({
  name: z.string(),
  gamesPlayed: z.number().nullable(),
  minutes: z.string().nullable(),
  goalsAgainst: z.number().nullable(),
  saves: z.number().nullable(),
  shotsAgainst: z.number().nullable(),
  savePct: z.number().nullable().describe("Save percentage as a percent number"),
  gaa: z.number().nullable().describe("Goals against average per 60 min"),
  shutouts: z.number().nullable(),
  wins: z.number().nullable(),
  losses: z.number().nullable(),
});

const TeamBriefing = z.object({
  name: z.string(),
  position: z.number().nullable().describe("Standing position in league"),
  points: z.number().nullable(),
  gamesPlayed: z.number().nullable(),
  lastFive: z.array(GameResult).max(5),
  topScorers: z.array(Scorer).max(5),
  powerPlayPct: z.number().nullable().describe("PP% as a percent number"),
  penaltyKillPct: z.number().nullable().describe("PK% as a percent number"),
  powerPlayGoals: z.number().int().nullable().default(null).describe("PP goals scored this season"),
  penaltyKillGoalsAgainst: z.number().int().nullable().default(null).describe("PP goals conceded while shorthanded this season"),
  venueForm: z
    .object({ home: VenueSplit, away: VenueSplit })
    .nullable()
    .default(null)
    .describe("Win/tie/loss streaks split by venue"),
  periodGoals: PeriodGoals.nullable().default(null).describe("Season totals of goals scored per period"),
  goalies: z.array(Goalie).max(5).default([]).describe("Goalies with playing time this season"),
  hotPlayer: z
    .object({
      name: z.string(),
      points: z.number().int().min(0),
      goals: z.number().int().min(0),
      assists: z.number().int().min(0),
      games: z.number().int().min(1).describe("Number of recent games scanned"),
    })
    .nullable()
    .default(null)
    .describe("Top points scorer over the team's last played games"),
  discipline: z
    .object({
      totalPim: z.number().int().min(0),
      gamesPlayed: z.number().int().min(0),
      perGame: z.number().min(0),
      topOffenders: z
        .array(
          z.object({
            name: z.string(),
            pim: z.number().int().min(0),
            gamesPlayed: z.number().int().min(0).nullable(),
          }),
        )
        .max(5),
    })
    .nullable()
    .default(null)
    .describe("Season penalty-minutes totals and most-penalized players"),
  faceoffs: z.object({
    teamFoPct: z.number().nullable().describe("Team overall FO win % (0-100)"),
    players: z.array(z.object({
      name: z.string(),
      foWins: z.number().int(),
      foLosses: z.number().int(),
      foTotal: z.number().int(),
      foPct: z.number().describe("FO win % (0-100)"),
    })).max(5).describe("Top players by FO%, minimum 10 total faceoffs"),
  }).nullable().default(null).describe("Season faceoff statistics"),
 shotsForPerGame: z.number().nullable().default(null).describe("Season shots on goal per game (SOG/GP from scoring efficiency page)"),
  shotsAgainstPerGame: z.number().nullable().default(null).describe("Season shots against per game (SOA/GP from goalkeeping efficiency page)"),
  goalsFor: z.number().int().nullable().default(null).describe("Season goals for total"),
  goalsAgainst: z.number().int().nullable().default(null).describe("Season goals against total"),
  wins: z.number().int().nullable().default(null).describe("Regulation wins"),
  otWins: z.number().int().nullable().default(null).describe("Overtime/shootout wins"),
  otLosses: z.number().int().nullable().default(null).describe("Overtime/shootout losses"),
});

const BriefingSchema = z.object({
  league: z.string().default("HockeyEttan Södra"),
  home: TeamBriefing,
  away: TeamBriefing,
  headToHead: z
    .array(
      z.object({
        date: z.string(),
        homeTeam: z.string(),
        awayTeam: z.string(),
        score: z.string(),
        gameId: z.string().nullable().default(null),
      }),
    )
    .describe("Previous meetings this season between these two teams"),
  notes: z.string().describe("Short summary or caveats; empty string if none"),
  warnings: z.array(z.string()).default([]).describe("Operator-visible data-quality warnings, e.g. degraded scrape paths"),
});

export type Briefing = z.infer<typeof BriefingSchema>;

const TeamsSchema = z.object({
  teams: z.array(z.string()).min(4),
});

// ---------- Server FNs ----------

export const listSeasons = createServerFn({ method: "GET" }).handler(async () => {
  const { getMergedSeasons } = await import("./seasons.server");
  const seasons = await getMergedSeasons();
  const def = seasons[0] ?? DEFAULT_SEASON;
  return { seasons, default: def };
});

export const listTeams = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ season: z.string().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const season = await resolveSeason(data.season);
    const key = `${seasonCachePrefix(season.label)}:teams`;
    const { getCached, setCached } = await import("./stats.server");
    const cached = await getCached(key, TEAMS_TTL_MS);
    if (cached) return cached as { teams: string[]; fetchedAt: string; season: string };

    const { parseTeamsFromStandings } = await import("./stats.server");
    const teams = await parseTeamsFromStandings("", season);
    const payload = { teams, fetchedAt: new Date().toISOString(), season: season.label };
    await setCached(key, payload);
    return payload;
  });

export const getMatchupBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        home: z.string().min(1),
        away: z.string().min(1),
        season: z.string().optional(),
        force: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const season = await resolveSeason(data.season);
    const { getCached, setCached, buildBriefing } = await import(
      "./stats.server"
    );
    const { recordScrape } = await import("./scrape-metrics.server");
    const key = `${seasonCachePrefix(season.label)}:briefing:${data.home}__vs__${data.away}`.toLowerCase();
    if (!data.force) {
      const cached = await getCached(key, CACHE_TTL_MS);
      if (cached) {
        await recordScrape(
          { endpoint: "briefing", season: season.label, cacheHit: true, context: { home: data.home, away: data.away } },
          async () => true,
        );
        // Log view even on cache hit so usage is visible.
        await logAuditEvent(context.supabase, context.userId, "briefing_view", {
          home: data.home,
          away: data.away,
          season: season.label,
          cached: true,
        });
        return {
          ...(cached as { briefing: Briefing; fetchedAt: string }),
          cached: true,
          season: season.label,
        };
      }
    }
    const briefing = await recordScrape(
      { endpoint: "briefing", season: season.label, cacheHit: false, context: { home: data.home, away: data.away } },
      () => buildBriefing(data.home, data.away, season, data.force),
    );
    const payload = { briefing, fetchedAt: new Date().toISOString() };
    await setCached(key, payload);
    await logAuditEvent(context.supabase, context.userId, "briefing_view", {
      home: data.home,
      away: data.away,
      season: season.label,
      cached: false,
    });
    return { ...payload, cached: false, season: season.label };
  });

// ---------- Season detection / confirmation ----------

export const scanForNewSeasons = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ force: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { runSeasonScan } = await import("./seasons.server");
    return runSeasonScan({ force: data.force });
  });

export const listPendingSeasons = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { listPendingDetections } = await import("./seasons.server");
    const pending = await listPendingDetections();
    return { pending };
  });

export const confirmSeasonDetection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        competitionId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { confirmDetection } = await import("./seasons.server");
    await confirmDetection(data);
    return { ok: true };
  });

export const dismissSeasonDetection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { dismissDetection } = await import("./seasons.server");
    await dismissDetection(data.id);
    return { ok: true };
  });

// Look up today's scheduled game (in Europe/Stockholm) from the league schedule.
// Returns the matchup if one is on today, otherwise null.
export const getTodaysMatchup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ season: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const season = await resolveSeason(data.season);
    // Today in Europe/Stockholm as YYYY-MM-DD
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    const today = `${y}-${m}-${d}`;
    const { findMatchupOnDate } = await import("./stats.server");
    const { recordScrape } = await import("./scrape-metrics.server");
    const match = await recordScrape(
      { endpoint: "todaysMatchup", season: season.label, context: { today } },
      () => findMatchupOnDate(season, today),
    );
    return { date: today, match, season: season.label };
  });

export { BriefingSchema, TeamsSchema };



// ---------- Historical depth ----------

export type AllTimeH2HResult = {
  totals: { wins: number; ties: number; losses: number; otWins: number; otLosses: number };
  atHome: { wins: number; ties: number; losses: number };
  atAway: { wins: number; ties: number; losses: number };
  meetings: number;
  seasonsCovered: { count: number; from: string | null; to: string | null };
};

export const getAllTimeHeadToHead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ home: z.string().min(1), away: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = `allTimeH2H:${CACHE_VERSION}:${data.home}__${data.away}`.toLowerCase();
    const { getCached, setCached, computeAllTimeHeadToHead } = await import(
      "./stats.server"
    );
    const cached = await getCached(key, HISTORY_TTL_MS);
    if (cached) return cached as AllTimeH2HResult;
    const result = await computeAllTimeHeadToHead(data.home, data.away);
    await setCached(key, result);
    return result;
  });

export type LastMeetingRecapResult = {
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
} | null;

export const getLastMeetingRecap = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        home: z.string().min(1),
        away: z.string().min(1),
        force: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = `lastMeeting:${CACHE_VERSION}:${data.home}__${data.away}`.toLowerCase();
    const { getCached, setCached, fetchLastMeetingRecap } = await import(
      "./stats.server"
    );
    if (!data.force) {
      const cached = await getCached(key, HISTORY_TTL_MS);
      if (cached) return cached as LastMeetingRecapResult;
    }
    const recap = await fetchLastMeetingRecap(data.home, data.away);
    await setCached(key, recap);
    return recap as LastMeetingRecapResult;
  });


export type SeasonTrajectoryResult = {
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

export const getSeasonTrajectory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ team: z.string().min(1), season: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const season = await resolveSeason(data.season);
    const key =
      `trajectory:${CACHE_VERSION}:${season.label}:${data.team}`.toLowerCase();
    const { getCached, setCached, fetchSeasonTrajectory } = await import(
      "./stats.server"
    );
    const cached = await getCached(key, HISTORY_TTL_MS);
    if (cached) return cached as SeasonTrajectoryResult;
    const traj = await fetchSeasonTrajectory(data.team, season);
    await setCached(key, traj);
    return traj as SeasonTrajectoryResult;
  });

// ---------- Full standings (Compare page) ----------

export type StandingsRow = {
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
};

export const getFullStandings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ season: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const season = await resolveSeason(data.season);
    const key = `fullStandings:${CACHE_VERSION}:${season.label}`;
    const { getCached, setCached, fetchFullStandings } = await import(
      "./stats.server"
    );
    const { recordScrape } = await import("./scrape-metrics.server");
    const cached = await getCached(key, CACHE_TTL_MS);
    if (cached) {
      await recordScrape(
        { endpoint: "standings", season: season.label, cacheHit: true },
        async () => true,
      );
      return cached as { rows: StandingsRow[]; season: string };
    }
    const rows = await recordScrape(
      { endpoint: "standings", season: season.label, cacheHit: false },
      () => fetchFullStandings(season),
    );
    const payload = { rows, season: season.label };
    await setCached(key, payload);
    return payload;
  });

// ---------- League-wide overview (home-page cards) ----------

export type LeagueOverviewResult = {
  seasonLabel: string;
  topScorers: Array<{
    rank: number;
    name: string;
    team: string;
    goals: number | null;
    assists: number | null;
    points: number;
    gamesPlayed: number | null;
  }>;
  topGoalies: Array<{
    rank: number;
    name: string;
    team: string;
    gamesPlayed: number;
    savePct: number | null;
    gaa: number | null;
    shutouts: number | null;
    wins: number | null;
    losses: number | null;
  }>;
  hottestTeams: Array<{
    rank: number;
    team: string;
    points: number;
    results: Array<"W" | "OTW" | "T" | "OTL" | "L">;
    goalsFor: number;
    goalsAgainst: number;
  }>;
  highestScoring: Array<{
    rank: number;
    team: string;
    gamesPlayed: number;
    goalsFor: number;
    goalsAgainst: number;
    perGame: number;
  }>;
  bestDefenses: Array<{
    rank: number;
    team: string;
    gamesPlayed: number;
    goalsFor: number;
    goalsAgainst: number;
    perGame: number;
  }>;
};

export const getLeagueOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ season: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const season = await resolveSeason(data.season);
    const key = `leagueOverview:${CACHE_VERSION}:${season.label}`;
    const { getCached, setCached, fetchLeagueOverview } = await import(
      "./stats.server"
    );
    const cached = await getCached(key, CACHE_TTL_MS);
    if (cached) return cached as LeagueOverviewResult;
    const overview = await fetchLeagueOverview(season);
    await setCached(key, overview);
    return overview as LeagueOverviewResult;
  });

// ---------- Season schedule (full fixture list) ----------

export type ScheduleEntry = {
  id: string | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
};

export type ScheduleResult = {
  season: string;
  games: ScheduleEntry[];
};

export const getSeasonSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ season: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const season = await resolveSeason(data.season);
    const key = `schedule:${CACHE_VERSION}:${season.label}`;
    const { getCached, setCached, getScheduleGames } = await import(
      "./stats.server"
    );
    const cached = await getCached(key, CACHE_TTL_MS);
    if (cached) return cached as ScheduleResult;
    const raw = await getScheduleGames(season);
    const games: ScheduleEntry[] = raw.map((g) => ({
      id: g.id,
      date: g.date,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeGoals: g.homeGoals,
      awayGoals: g.awayGoals,
      played: g.played,
    }));
    const payload: ScheduleResult = { season: season.label, games };
    await setCached(key, payload);
    return payload;
  });







// ---------- League-wide players (/spelare) ----------

export type LeaguePlayer = {
  team: string;
  name: string;
  position: string;
  gamesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  points: number | null;
  pim: number | null;
};

export type LeaguePlayersResult = {
  season: string;
  players: LeaguePlayer[];
};

export const getLeaguePlayers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ season: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<LeaguePlayersResult> => {
    const season = await resolveSeason(data.season);
    const key = `leaguePlayers:${CACHE_VERSION}:${season.label}`;
    const { getCached, setCached, fetchAllLeaguePlayers } = await import(
      "./stats.server"
    );
    const cached = await getCached(key, CACHE_TTL_MS);
    if (cached) return cached as LeaguePlayersResult;
    const players = await fetchAllLeaguePlayers(season);
    const payload: LeaguePlayersResult = { season: season.label, players };
    await setCached(key, payload);
    return payload;
  });

// ---------- Next match for a given team ----------

export type NextMatchResult = {
  season: string;
  team: string;
  match:
    | {
        id: string | null;
        date: string;
        homeTeam: string;
        awayTeam: string;
        isHome: boolean;
        opponent: string;
      }
    | null;
};

export const getNextMatchForTeam = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ team: z.string().min(1), season: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<NextMatchResult> => {
    const season = await resolveSeason(data.season);
    const { getScheduleGames } = await import("./stats.server");
    const { recordScrape } = await import("./scrape-metrics.server");
    const games = await recordScrape(
      { endpoint: "nextMatchForTeam", season: season.label, context: { team: data.team } },
      () => getScheduleGames(season),
    );
    const today = new Date().toISOString().slice(0, 10);
    const lower = data.team.toLowerCase();
    const upcoming = games
      .filter(
        (g) =>
          !g.played &&
          g.date >= today &&
          (g.homeTeam.toLowerCase() === lower || g.awayTeam.toLowerCase() === lower),
      )
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const next = upcoming[0];
    if (!next) {
      return { season: season.label, team: data.team, match: null };
    }
    const isHome = next.homeTeam.toLowerCase() === lower;
    return {
      season: season.label,
      team: data.team,
      match: {
        id: next.id,
        date: next.date,
        homeTeam: next.homeTeam,
        awayTeam: next.awayTeam,
        isHome,
        opponent: isHome ? next.awayTeam : next.homeTeam,
      },
    };
  });
