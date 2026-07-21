import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

const RECENT_N = 10;

const fmt = (n: number | null | undefined, digits = 1) =>
  n != null && Number.isFinite(n) ? n.toFixed(digits) : "—";

function aggregateGoalies(team: TeamData) {
  const goalies = team.goalies ?? [];
  let shots = 0;
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
      valid = true;
    }
  }
  if (!valid || gp === 0) return { saPerGame: null as number | null };
  return { saPerGame: shots / gp };
}

function aggregateRecentShots(games: GameFlowResultDto["games"]) {
  const recent = games.slice(0, RECENT_N);
  const withFor = recent.filter(
    (g) => g.teamShots != null && Number.isFinite(g.teamShots),
  );
  const withAgainst = recent.filter(
    (g) => g.oppShots != null && Number.isFinite(g.oppShots),
  );
  return {
    avgFor: withFor.length
      ? withFor.reduce((s, g) => s + (g.teamShots ?? 0), 0) / withFor.length
      : null,
    avgAgainst: withAgainst.length
      ? withAgainst.reduce((s, g) => s + (g.oppShots ?? 0), 0) / withAgainst.length
      : null,
    n: recent.length,
  };
}

export function ShotCard({
  home,
  away,
  homeFlow,
  awayFlow,
}: {
  home: TeamData;
  away: TeamData;
  homeFlow: GameFlowResultDto | null | undefined;
  awayFlow: GameFlowResultDto | null | undefined;
}) {
  const homeRecent = aggregateRecentShots(homeFlow?.games ?? []);
  const awayRecent = aggregateRecentShots(awayFlow?.games ?? []);
  const homeGoalie = aggregateGoalies(home);
  const awayGoalie = aggregateGoalies(away);

  const recentN = Math.max(homeRecent.n, awayRecent.n);

  // Per-period breakdown — home team's perspective, recent games only
  const perPeriodHome: [number, number, number] = [0, 0, 0];
  const perPeriodAway: [number, number, number] = [0, 0, 0];
  const homeRecentGames = (homeFlow?.games ?? []).slice(0, RECENT_N);
  for (const g of homeRecentGames) {
    g.teamShotsByPeriod.slice(0, 3).forEach((v, i) => {
      if (Number.isFinite(v)) perPeriodHome[i] += v || 0;
    });
    g.oppShotsByPeriod.slice(0, 3).forEach((v, i) => {
      if (Number.isFinite(v)) perPeriodAway[i] += v || 0;
    });
  }

  const rows = [
    {
      label: `SF/match · senaste ${RECENT_N}`,
      homeVal: homeRecent.avgFor,
      awayVal: awayRecent.avgFor,
    },
    {
      label: `SA/match · senaste ${RECENT_N}`,
      homeVal: homeRecent.avgAgainst,
      awayVal: awayRecent.avgAgainst,
    },
    {
      label: "SF/match · säsong",
      homeVal: home.shotsForPerGame ?? null,
      awayVal: away.shotsForPerGame ?? null,
    },
    {
      label: "SA/match · säsong",
      homeVal: homeGoalie.saPerGame,
      awayVal: awayGoalie.saPerGame,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skott</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team name headers */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-medium">
          <span>{home.name}</span>
          <span className="w-44" />
          <span className="text-right">{away.name}</span>
        </div>

        {/* 4 stat rows */}
        <div className="space-y-3">
          {rows.map(({ label, homeVal, awayVal }) => (
            <div
              key={label}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
            >
              <span className="font-mono text-xl">{fmt(homeVal)}</span>
              <span className="w-44 text-center text-xs text-muted-foreground">
                {label}
              </span>
              <span className="font-mono text-xl text-right">{fmt(awayVal)}</span>
            </div>
          ))}
        </div>

        {/* Per-period breakdown */}
        {homeRecentGames.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Skott per period · senaste {recentN} matcher (summa)
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {([0, 1, 2] as const).map((i) => {
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
        )}
      </CardContent>
    </Card>
  );
}
