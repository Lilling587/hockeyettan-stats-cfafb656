import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ShotTimelineCard } from "../shot-timeline-card";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

function makeData(overrides: Partial<GameFlowResultDto> = {}): GameFlowResultDto {
  const games = [
    {
      gameId: "1",
      date: "2026-01-01",
      opponent: "OPP",
      teamShots: 30,
      oppShots: 25,
      teamShotsByPeriod: [10, 10, 10],
      oppShotsByPeriod: [8, 9, 8],
      teamPim: 6,
      oppPim: 4,
      teamPpGoals: 1,
      oppPpGoals: 0,
      teamPpOpportunities: 3,
      oppPpOpportunities: 2,
    },
    {
      gameId: "2",
      date: "2026-01-03",
      opponent: "OPP2",
      teamShots: 28,
      oppShots: 32,
      teamShotsByPeriod: [9, 10, 9],
      oppShotsByPeriod: [11, 11, 10],
      teamPim: 8,
      oppPim: 6,
      teamPpGoals: 0,
      oppPpGoals: 1,
      teamPpOpportunities: 2,
      oppPpOpportunities: 4,
    },
  ];
  return {
    team: "TEAM",
    season: "2025/2026",
    games,
    lineupDiff: {
      currentGameId: null,
      previousGameId: null,
      previousGameDate: null,
      previousGameOpponent: null,
      likelyInjured: [],
      healthyScratches: [],
      newInLineup: [],
      outOfLineup: [],
      currentRosterSize: 0,
      lastLineupSize: 0,
    },
    ...overrides,
  } as unknown as GameFlowResultDto;
}

const SUBTITLE_TEMPLATE = (n: number) => `Senaste ${n} spelade matcherna.`;

describe("ShotTimelineCard", () => {
  it("renders identical subtitle text for home and away teams", () => {
    const data = makeData();
    const home = render(<ShotTimelineCard teamName="Hemma" data={data} />);
    const away = render(<ShotTimelineCard teamName="Borta" data={data} />);

    const expected = SUBTITLE_TEMPLATE(data.games.length);
    expect(home.getByText(expected)).toBeTruthy();
    expect(away.getByText(expected)).toBeTruthy();

    // The subtitle must NOT include the old removed phrase.
    expect(home.container.textContent).not.toMatch(/Skott på mål/);
    expect(away.container.textContent).not.toMatch(/Skott på mål/);
  });

  it("matches inline snapshot for the subtitle text", () => {
    const data = makeData();
    const { container } = render(
      <ShotTimelineCard teamName="Hemma" data={data} />,
    );
    const subtitle = container.querySelector("p")?.textContent;
    expect(subtitle).toMatchInlineSnapshot(`"Senaste 2 spelade matcherna."`);
  });

  it("renders the missing-data fallback when data is null", () => {
    const { getByText } = render(
      <ShotTimelineCard teamName="Hemma" data={null} />,
    );
    expect(getByText("Data saknas.")).toBeTruthy();
  });
});
