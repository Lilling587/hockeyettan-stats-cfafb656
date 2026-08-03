import { describe, expect, it } from "vitest";
import { buildStorylines, topStorylines } from "@/lib/storylines";
import type { Briefing } from "@/lib/stats.functions";

type TeamData = Briefing["home"];

function team(overrides: Partial<TeamData> = {}): TeamData {
  return {
    name: "Test IK",
    position: null,
    points: null,
    gamesPlayed: null,
    lastFive: [],
    topScorers: [],
    powerPlayPct: null,
    penaltyKillPct: null,
    powerPlayGoals: null,
    penaltyKillGoalsAgainst: null,
    powerPlayOpportunities: null,
    penaltyKillOpportunities: null,
    ppTimePerGoal: null,
    pkTimePerGoal: null,
    venueForm: null,
    periodGoals: null,
    periodWinPct: null,
    goalTypeSplit: null,
    goalies: [],
    hotPlayer: null,
    discipline: null,
    faceoffs: null,
    shotsForPerGame: null,
    shotsAgainstPerGame: null,
    goalsFor: null,
    goalsAgainst: null,
    wins: null,
    otWins: null,
    otLosses: null,
    gwsw: null,
    gwsl: null,
    ...overrides,
  } as TeamData;
}

function briefing(home: TeamData, away: TeamData): Briefing {
  return {
    league: "HockeyEttan Södra",
    home,
    away,
    headToHead: [],
    notes: "",
    warnings: [],
  } as Briefing;
}

const game = (result: "W" | "L") => ({
  date: "2026-01-01",
  opponent: "Motståndare",
  score: "3-1",
  result,
  isHome: true,
});

describe("buildStorylines", () => {
  it("returns nothing when there is no data to talk about", () => {
    const lines = buildStorylines(briefing(team(), team({ name: "Borta BK" })));
    expect(lines).toEqual([]);
  });

  it("reports a winning streak of three or more", () => {
    const home = team({
      name: "Grästorps IK",
      lastFive: [game("W"), game("W"), game("W"), game("L")],
    });
    const lines = buildStorylines(briefing(home, team({ name: "Borta BK" })));
    const streak = lines.find((l) => l.id === "streak-home");
    expect(streak?.text).toBe("Grästorps IK har vunnit 3 raka matcher.");
  });

  it("ignores streaks shorter than three games", () => {
    const home = team({ name: "Grästorps IK", lastFive: [game("W"), game("W"), game("L")] });
    const lines = buildStorylines(briefing(home, team({ name: "Borta BK" })));
    expect(lines.find((l) => l.id === "streak-home")).toBeUndefined();
  });

  it("highlights a clear special teams edge", () => {
    const home = team({ name: "Grästorps IK", powerPlayPct: 25, penaltyKillPct: 80 });
    const away = team({ name: "Borta BK", powerPlayPct: 12, penaltyKillPct: 79 });
    const lines = buildStorylines(briefing(home, away));
    const special = lines.find((l) => l.id === "special-powerplay");
    expect(special?.text).toContain("Grästorps IK");
    expect(special?.text).toContain("25,0%");
  });

  it("skips a special teams point when the teams are close", () => {
    const home = team({ powerPlayPct: 20, penaltyKillPct: 80 });
    const away = team({ name: "Borta BK", powerPlayPct: 19, penaltyKillPct: 81 });
    const lines = buildStorylines(briefing(home, away));
    expect(lines.some((l) => l.id.startsWith("special-"))).toBe(false);
  });

  it("caps the number of points shown", () => {
    const home = team({
      name: "Grästorps IK",
      position: 1,
      points: 60,
      lastFive: [game("W"), game("W"), game("W"), game("W"), game("W")],
      powerPlayPct: 30,
      penaltyKillPct: 90,
      periodGoals: { p1: 20, p2: 25, p3: 30, ot: 1, total: 76, games: 20 },
      discipline: { totalPim: 200, gamesPlayed: 20, perGame: 10, topOffenders: [] },
    });
    const away = team({
      name: "Borta BK",
      position: 12,
      points: 20,
      lastFive: [game("L"), game("L"), game("L"), game("L"), game("L")],
      powerPlayPct: 10,
      penaltyKillPct: 70,
      periodGoals: { p1: 10, p2: 12, p3: 30, ot: 0, total: 52, games: 20 },
      discipline: { totalPim: 60, gamesPlayed: 20, perGame: 3, topOffenders: [] },
    });
    expect(topStorylines(briefing(home, away))).toHaveLength(6);
  });
});
