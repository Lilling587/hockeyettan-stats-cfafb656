import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_SEASON, getSeason, type Season } from "./seasons.config";

async function resolveSeason(label?: string | null): Promise<Season> {
  const fromConfig = getSeason(label);
  if (!label) return fromConfig;
  try {
    const { getMergedSeasons } = await import("./seasons.server");
    const merged = await getMergedSeasons();
    return merged.find((s) => s.label === label) ?? fromConfig;
  } catch {
    return fromConfig;
  }
}

export type GameFlowGamePointDto = {
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

export type GameFlowResultDto = {
  team: string;
  seasonLabel: string;
  games: GameFlowGamePointDto[];
  lineupDiff: {
    gameId: string | null;
    date: string | null;
    opponent: string | null;
    previousDate: string | null;
    previousOpponent: string | null;
    newInLineup: string[];
    outOfLineup: string[];
    lineupAvailable: boolean;
  };
};

export const getGameFlow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        team: z.string().min(1),
        season: z.string().optional(),
        n: z.number().int().min(1).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<GameFlowResultDto> => {
    const season = await resolveSeason(data.season);
    const { computeGameFlow } = await import("./game-flow.server");
    const result = await computeGameFlow(data.team, season, data.n ?? 10);
    return result as GameFlowResultDto;
  });

// Convenience: fetch both teams in parallel for the briefing.
export const getGameFlowForMatchup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        home: z.string().min(1),
        away: z.string().min(1),
        season: z.string().optional(),
        n: z.number().int().min(1).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{
    home: GameFlowResultDto;
    away: GameFlowResultDto;
  }> => {
    const season = await resolveSeason(data.season);
    const { computeGameFlow } = await import("./game-flow.server");
    const [home, away] = await Promise.all([
      computeGameFlow(data.home, season, data.n ?? 10),
      computeGameFlow(data.away, season, data.n ?? 10),
    ]);
    return {
      home: home as GameFlowResultDto,
      away: away as GameFlowResultDto,
    };
  });
