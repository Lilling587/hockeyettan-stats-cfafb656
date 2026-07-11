import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LineupDiffCard } from "../lineup-diff-card";
import type {
  GameFlowResultDto,
  LineupPlayerChangeDto,
} from "@/lib/game-flow.functions";

function player(
  name: string,
  overrides: Partial<LineupPlayerChangeDto> = {},
): LineupPlayerChangeDto {
  return {
    name,
    status: "regular_missing",
    gamesPlayedOfLastN: 4,
    lastPlayedDate: "2026-01-05",
    lastPlayedOpponent: "OPP",
    onRoster: true,
    ...overrides,
  };
}

function makeData(
  team: string,
  diff: Partial<GameFlowResultDto["lineupDiff"]> = {},
): GameFlowResultDto {
  return {
    team,
    seasonLabel: "2025/2026",
    games: [],
    lineupDiff: {
      gameId: "g1",
      date: "2026-01-10",
      opponent: "MOT",
      previousGameId: "g0",
      previousDate: "2026-01-07",
      previousOpponent: "TIDIGARE",
      missingFromLastGame: [],
      playedButNotOnRoster: [],
      likelyInjured: [],
      healthyScratches: [],
      newInLineup: [],
      outOfLineup: [],
      rosterSize: 25,
      playedCount: 20,
      lineupSampleSize: 5,
      lineupAvailable: true,
      ...diff,
    },
  };
}

/**
 * Strip volatile attributes (class names from Tailwind, radix ids) and
 * whitespace so the snapshot captures the semantic structure and text —
 * the parts that must stay consistent between home and away.
 */
function normalize(html: string): string {
  return html
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sid="[^"]*"/g, "")
    .replace(/\sdata-[a-z-]+="[^"]*"/g, "")
    .replace(/\saria-[a-z-]+="[^"]*"/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

describe("Dashboard lineup diff layout", () => {
  const home = makeData("HEMMA", {
    likelyInjured: [
      player("Andersson, Erik", { gamesPlayedOfLastN: 4 }),
      player("Berg, Karl", { gamesPlayedOfLastN: 5 }),
    ],
    newInLineup: [player("Ny, Alex", { status: "returning", gamesPlayedOfLastN: 2 })],
    outOfLineup: [player("Ut, Johan", { status: "occasional_missing" })],
    playedButNotOnRoster: ["Junior, Sam"],
    healthyScratches: [player("Scratch, Per", { gamesPlayedOfLastN: 0 })],
  });

  const away = makeData("BORTA", {
    likelyInjured: [player("Nilsson, Olof", { gamesPlayedOfLastN: 5 })],
    newInLineup: [player("Ny, Filip", { status: "new_callup", onRoster: false, gamesPlayedOfLastN: 1 })],
    outOfLineup: [
      player("Ut, Elias", { status: "occasional_missing" }),
      player("Ut, Viktor", { status: "regular_missing", gamesPlayedOfLastN: 4 }),
    ],
  });

  it("matches the combined dashboard snapshot", () => {
    const { container } = render(
      <div className="grid gap-4 lg:grid-cols-2" data-testid="dashboard-lineup-row">
        <LineupDiffCard teamName="Hemma" data={home} />
        <LineupDiffCard teamName="Borta" data={away} />
      </div>,
    );
    expect(normalize(container.innerHTML)).toMatchSnapshot();
  });

  it("renders both cards in the same row wrapper", () => {
    const { getByTestId, getAllByText } = render(
      <div data-testid="dashboard-lineup-row" className="grid gap-4 lg:grid-cols-2">
        <LineupDiffCard teamName="Hemma" data={home} />
        <LineupDiffCard teamName="Borta" data={away} />
      </div>,
    );
    const row = getByTestId("dashboard-lineup-row");
    // Two lineup cards, one per team (Card renders div.rounded-xl.border).
    expect(row.children.length).toBe(2);
    // Both teams' titles are present.
    expect(getAllByText(/Laguppställning$/).length).toBe(2);
  });
});
