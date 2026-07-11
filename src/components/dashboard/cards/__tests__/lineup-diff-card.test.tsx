import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
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
  diff: Partial<GameFlowResultDto["lineupDiff"]> = {},
): GameFlowResultDto {
  return {
    team: "TEAM",
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

describe("LineupDiffCard", () => {
  it("labels likely-injured players with the last-game comparison rate", () => {
    const data = makeData({
      likelyInjured: [
        player("Andersson, Erik", {
          gamesPlayedOfLastN: 4,
          lastPlayedDate: "2026-01-05",
          lastPlayedOpponent: "OPP",
        }),
      ],
    });

    const { container, getByText } = render(
      <LineupDiffCard teamName="Hemma" data={data} />,
    );

    expect(getByText("Erik Andersson")).toBeTruthy();
    // Sample-size rate matches "N/5 senaste" and the last-played detail.
    expect(container.textContent).toContain("4/5 senaste");
    expect(container.textContent).toContain("senast 2026-01-05 mot OPP");
    // Section heading present.
    expect(getByText(/Troligen skadad \/ borta/)).toBeTruthy();
  });

  it("shows previous-game diff header with the correct date and opponent", () => {
    const data = makeData({
      newInLineup: [
        player("Ny, Spelare", { status: "returning", gamesPlayedOfLastN: 2 }),
      ],
      outOfLineup: [
        player("Ute, Spelare", { status: "occasional_missing", gamesPlayedOfLastN: 3 }),
      ],
    });

    const { container, getByText } = render(
      <LineupDiffCard teamName="Borta" data={data} />,
    );

    // Header quotes the previous game's date + opponent from the diff.
    expect(container.textContent).toMatch(
      /Förändringar mot 2026-01-07 \(TIDIGARE\)/,
    );
    expect(getByText("Spelare Ny")).toBeTruthy();
    expect(getByText("Spelare Ute")).toBeTruthy();
  });

  it("flags players not on the roster with the ej på trupplistan badge", () => {
    const data = makeData({
      playedButNotOnRoster: ["Callup, Junior"],
      newInLineup: [
        player("Callup, Junior", {
          status: "new_callup",
          onRoster: false,
          gamesPlayedOfLastN: 1,
        }),
      ],
    });

    const { getAllByText } = render(
      <LineupDiffCard teamName="Hemma" data={data} />,
    );

    // Row rendered with the "ej på trupplistan" badge.
    const badges = getAllByText("ej på trupplistan");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders the fallback text when no lineup is available", () => {
    const data = makeData({ lineupAvailable: false, gameId: "g1" });
    const { getByText } = render(
      <LineupDiffCard teamName="Hemma" data={data} />,
    );
    expect(getByText("Laguppställning saknas för senaste matchen.")).toBeTruthy();
  });

  it("keeps home and away section headings identical", () => {
    const data = makeData({
      likelyInjured: [player("A, B")],
      newInLineup: [player("C, D")],
      outOfLineup: [player("E, F")],
    });
    const home = render(<LineupDiffCard teamName="Hemma" data={data} />);
    const away = render(<LineupDiffCard teamName="Borta" data={data} />);
    const headings = [
      "Troligen skadad / borta",
      "In i laguppställningen",
      "Ut ur laguppställningen",
    ];
    for (const h of headings) {
      expect(within(home.container).getByText(h)).toBeTruthy();
      expect(within(away.container).getByText(h)).toBeTruthy();
    }
  });
});
