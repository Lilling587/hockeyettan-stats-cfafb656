import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";

export function SpecialTeamsCard({
  team,
  opponent,
}: {
  team: TeamData;
  opponent: TeamData;
}) {
  const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : "—");

  const edgeBadge = (mine: number | null, theirs: number | null) => {
    if (mine == null || theirs == null) return null;
    const diff = mine - theirs;
    if (Math.abs(diff) < 0.05) {
      return <Badge variant="secondary">Jämnt</Badge>;
    }
    if (diff > 0) {
      return <Badge variant="default">+{diff.toFixed(1)}%</Badge>;
    }
    return null;
  };

  const fmtGoalOpp = (goals: number | null, opp: number | null, goalLabel: string) => {
    if (goals == null && opp == null) return "—";
    const g = goals != null ? `${goals} ${goalLabel}` : "—";
    const o = opp != null ? `${opp} tillfällen` : null;
    return o ? `${g} / ${o}` : g;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base min-w-0 truncate">{team.name} · Special teams</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Powerplay */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Powerplay</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fmtPct(team.powerPlayPct)}</span>
              {edgeBadge(team.powerPlayPct, opponent.powerPlayPct)}
            </div>
            <div className="text-sm text-muted-foreground">
              {fmtGoalOpp(team.powerPlayGoals, team.powerPlayOpportunities, "mål")}
            </div>
            {team.ppTimePerGoal && (
              <div>
                <div className="text-xs text-muted-foreground">Tid i snitt</div>
                <div className="text-sm">{team.ppTimePerGoal} per mål</div>
              </div>
            )}
          </div>

          {/* Boxplay */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Boxplay</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fmtPct(team.penaltyKillPct)}</span>
              {edgeBadge(team.penaltyKillPct, opponent.penaltyKillPct)}
            </div>
            <div className="text-sm text-muted-foreground">
              {fmtGoalOpp(team.penaltyKillGoalsAgainst, team.penaltyKillOpportunities, "insläppta")}
            </div>
            {team.pkTimePerGoal && (
              <div>
                <div className="text-xs text-muted-foreground">Tid i snitt</div>
                <div className="text-sm">{team.pkTimePerGoal} per mål</div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
