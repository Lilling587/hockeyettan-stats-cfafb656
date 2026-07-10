import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";
import type { GameFlowResultDto } from "@/lib/game-flow.functions";

export function SpecialTeamsTimelineCard({
  team,
  opponent,
  flow,
}: {
  team: TeamData;
  opponent: TeamData;
  flow: GameFlowResultDto | null | undefined;
}) {
  const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : "—");

  const renderEdge = (mine: number | null, theirs: number | null) => {
    if (mine == null || theirs == null) return null;
    const diff = mine - theirs;
    if (Math.abs(diff) < 0.05) {
      return (
        <Badge variant="secondary" className="mt-1">
          Jämnt
        </Badge>
      );
    }
    if (diff > 0) {
      return (
        <Badge variant="default" className="mt-1">
          +{diff.toFixed(1)}%
        </Badge>
      );
    }
    return null;
  };

  const games = flow?.games ? [...flow.games].reverse() : [];
  const totalPpGoalsFor = games.reduce((s, g) => s + g.teamPpGoals, 0);
  const totalPpGoalsAgainst = games.reduce((s, g) => s + g.oppPpGoals, 0);
  const totalPim = games.reduce((s, g) => s + (g.teamPim ?? 0), 0);
  const totalOppPim = games.reduce((s, g) => s + (g.oppPim ?? 0), 0);
  const withPpPct = games.filter((g) => g.teamPpPct != null);
  const avgPpPct = withPpPct.length
    ? withPpPct.reduce((s, g) => s + (g.teamPpPct ?? 0), 0) / withPpPct.length
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Special teams</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-semibold">{fmtPct(team.powerPlayPct)}</div>
            <div className="text-xs text-muted-foreground">Powerplay (säsong)</div>
            {renderEdge(team.powerPlayPct, opponent.powerPlayPct)}
          </div>
          <div>
            <div className="text-2xl font-semibold">{fmtPct(team.penaltyKillPct)}</div>
            <div className="text-xs text-muted-foreground">Boxplay (säsong)</div>
            {renderEdge(team.penaltyKillPct, opponent.penaltyKillPct)}
          </div>
        </div>

        {games.length > 0 && (
          <>
            <div className="border-t pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Senaste {games.length} matcherna
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div>
                  <div className="font-mono text-base">{totalPpGoalsFor}</div>
                  <div className="text-[10px] text-muted-foreground">PP-mål för</div>
                </div>
                <div>
                  <div className="font-mono text-base">{totalPpGoalsAgainst}</div>
                  <div className="text-[10px] text-muted-foreground">PP-mål mot</div>
                </div>
                <div>
                  <div className="font-mono text-base">{totalPim}</div>
                  <div className="text-[10px] text-muted-foreground">PIM för</div>
                </div>
                <div>
                  <div className="font-mono text-base">{totalOppPim}</div>
                  <div className="text-[10px] text-muted-foreground">PIM mot</div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                PP% per match (rullande)
              </div>
              <div className="flex items-end gap-1" style={{ minHeight: 40 }}>
                {games.map((g) => {
                  const pct = g.teamPpPct ?? 0;
                  const h = Math.min(32, (pct / 100) * 32);
                  return (
                    <div
                      key={g.gameId}
                      className="flex flex-1 flex-col items-center gap-0.5"
                      title={`${g.date} vs ${g.opponent}: PP ${g.teamPpPct != null ? g.teamPpPct.toFixed(1) + "%" : "—"} (${g.teamPpGoals} mål)`}
                    >
                      <div
                        className="w-full rounded-t bg-primary/70"
                        style={{ height: `${h}px` }}
                      />
                      <div className="text-[9px] text-muted-foreground">
                        {g.date.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {avgPpPct != null && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Snitt PP% senaste matcher: {avgPpPct.toFixed(1)}%
                  {team.powerPlayPct != null && (
                    <span className="ml-1">
                      · säsong {team.powerPlayPct.toFixed(1)}% (
                      {avgPpPct - team.powerPlayPct >= 0 ? "+" : ""}
                      {(avgPpPct - team.powerPlayPct).toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
