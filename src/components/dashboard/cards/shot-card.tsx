import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

function aggregateGoalies(team: TeamData) {
  const goalies = team.goalies ?? [];
  let shots = 0;
  let saves = 0;
  let gp = 0;
  let valid = false;
  for (const g of goalies) {
    if (
      g.shotsAgainst != null &&
      g.gamesPlayed != null &&
      Number.isFinite(g.shotsAgainst) &&
      Number.isFinite(g.gamesPlayed) &&
      g.gamesPlayed > 0
    ) {
      shots += g.shotsAgainst;
      gp += g.gamesPlayed;
      if (g.saves != null && Number.isFinite(g.saves)) saves += g.saves;
      valid = true;
    }
  }
  if (!valid || gp === 0) {
    return { shotsAgainstPerGame: null as number | null, teamSavePct: null as number | null };
  }
  return {
    shotsAgainstPerGame: shots / gp,
    teamSavePct: shots > 0 ? (saves / shots) * 100 : null,
  };
}

function aggregateFlow(flow: GameFlowResultDto | null | undefined) {
  if (!flow) return { avgFor: null as number | null, shotPct: null as number | null };
  const games = flow.games;
  const withShots = games.filter(
    (g) =>
      g.teamShots != null &&
      g.oppShots != null &&
      Number.isFinite(g.teamShots) &&
      Number.isFinite(g.oppShots),
  );
  const totalFor = withShots.reduce((s, g) => s + (g.teamShots ?? 0), 0);
  const totalAgainst = withShots.reduce((s, g) => s + (g.oppShots ?? 0), 0);
  const avgFor = withShots.length ? totalFor / withShots.length : null;
  const shotPct =
    totalFor + totalAgainst > 0 ? (totalFor / (totalFor + totalAgainst)) * 100 : null;
  return { avgFor, shotPct };
}

const fmt = (n: number | null, digits = 1) =>
  n != null && Number.isFinite(n) ? n.toFixed(digits) : "—";

function TeamColumn({
  team,
  flow,
  align,
}: {
  team: TeamData;
  flow: GameFlowResultDto | null | undefined;
  align: "left" | "right";
}) {
  const goalie = aggregateGoalies(team);
  const flowAgg = aggregateFlow(flow);
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <div className={`space-y-2 ${alignClass}`}>
      <div className="text-xs text-muted-foreground">{team.name}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="font-mono text-xl">{fmt(flowAgg.avgFor)}</div>
          <div className="text-xs text-muted-foreground">SF/match (senaste)</div>
        </div>
        <div>
          <div className="font-mono text-xl">{fmt(goalie.shotsAgainstPerGame)}</div>
          <div className="text-xs text-muted-foreground">SA/match (säsong)</div>
        </div>
        <div>
          <div className="font-mono text-xl">
            {flowAgg.shotPct != null ? `${flowAgg.shotPct.toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">SF%</div>
        </div>
        <div>
          <div className="font-mono text-xl">{fmt(goalie.teamSavePct, 2)}</div>
          <div className="text-xs text-muted-foreground">SV%</div>
        </div>
      </div>
    </div>
  );
}

export function ShotCard({
  home,
  away,
  homeFlow,
  awayFlow: _awayFlow,
}: {
  home: TeamData;
  away: TeamData;
  homeFlow: GameFlowResultDto | null | undefined;
  awayFlow: GameFlowResultDto | null | undefined;
}) {
  const homeGoalie = aggregateGoalies(home);
  const awayGoalie = aggregateGoalies(away);

  const defenseEdge: "home" | "away" | "even" | null =
    homeGoalie.shotsAgainstPerGame == null || awayGoalie.shotsAgainstPerGame == null
      ? null
      : Math.abs(homeGoalie.shotsAgainstPerGame - awayGoalie.shotsAgainstPerGame) < 0.5
        ? "even"
        : homeGoalie.shotsAgainstPerGame < awayGoalie.shotsAgainstPerGame
          ? "home"
          : "away";

  // Per-period from homeFlow: teamShotsByPeriod = home SF, oppShotsByPeriod = away SF
  const perPeriodHome: [number, number, number] = [0, 0, 0];
  const perPeriodAway: [number, number, number] = [0, 0, 0];
  if (homeFlow) {
    for (const g of homeFlow.games) {
      g.teamShotsByPeriod.slice(0, 3).forEach((v, i) => {
        if (Number.isFinite(v)) perPeriodHome[i] += v || 0;
      });
      g.oppShotsByPeriod.slice(0, 3).forEach((v, i) => {
        if (Number.isFinite(v)) perPeriodAway[i] += v || 0;
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skott</CardTitle>
        <p className="text-xs text-muted-foreground">Senaste matcher · snitt per match</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <TeamColumn team={home} flow={homeFlow} align="left" />
          <TeamColumn team={away} flow={_awayFlow} align="right" />
        </div>

        <div className="text-center">
          {defenseEdge === "even" ? (
            <Badge variant="secondary">Jämnt</Badge>
          ) : defenseEdge == null ? (
            <Badge variant="outline">Saknar data</Badge>
          ) : (
            <Badge variant="default">
              Fördel {defenseEdge === "home" ? home.name : away.name}
            </Badge>
          )}
        </div>

        {homeFlow ? (
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Skott per period (summa senaste matcher)
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[0, 1, 2].map((i) => {
                const diff = perPeriodHome[i] - perPeriodAway[i];
                return (
                  <div key={i} className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">P{i + 1}</div>
                    <div className="font-mono text-sm">
                      {perPeriodHome[i]}–{perPeriodAway[i]}
                    </div>
                    <Badge
                      variant={
                        diff > 0 ? "default" : diff < 0 ? "destructive" : "secondary"
                      }
                      className="mt-1"
                    >
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
