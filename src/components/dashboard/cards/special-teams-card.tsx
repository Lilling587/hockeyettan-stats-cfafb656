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

  const split = team.goalTypeSplit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base min-w-0 truncate">{team.name} · Special teams</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Powerplay */}
          <div>
            <div className="text-xs text-muted-foreground">Powerplay</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fmtPct(team.powerPlayPct)}</span>
              {edgeBadge(team.powerPlayPct, opponent.powerPlayPct)}
            </div>
            <div className="text-sm text-muted-foreground">
              {fmtGoalOpp(team.powerPlayGoals, team.powerPlayOpportunities, "mål")}
            </div>
          </div>

          {/* Boxplay */}
          <div>
            <div className="text-xs text-muted-foreground">Boxplay</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fmtPct(team.penaltyKillPct)}</span>
              {edgeBadge(team.penaltyKillPct, opponent.penaltyKillPct)}
            </div>
            <div className="text-sm text-muted-foreground">
              {fmtGoalOpp(team.penaltyKillGoalsAgainst, team.penaltyKillOpportunities, "insläppta")}
            </div>
          </div>
        </div>

        {split && (
          <div className="space-y-2 border-t pt-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Mål för — hur de avgörs</div>
              <div className="flex gap-3 text-sm">
                <span><span className="font-medium tabular-nums">{fmtPct(split.eqgPctFor)}</span> <span className="text-muted-foreground text-xs">EQ</span></span>
                <span><span className="font-medium tabular-nums">{fmtPct(split.ppgPctFor)}</span> <span className="text-muted-foreground text-xs">PP</span></span>
                <span><span className="font-medium tabular-nums">{fmtPct(split.shgPctFor)}</span> <span className="text-muted-foreground text-xs">SH</span></span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Mål emot — hur de avgörs</div>
              <div className="flex gap-3 text-sm">
                <span><span className="font-medium tabular-nums">{fmtPct(split.eqgPctAgainst)}</span> <span className="text-muted-foreground text-xs">EQ</span></span>
                <span><span className="font-medium tabular-nums">{fmtPct(split.ppgPctAgainst)}</span> <span className="text-muted-foreground text-xs">PP</span></span>
                <span><span className="font-medium tabular-nums">{fmtPct(split.shgPctAgainst)}</span> <span className="text-muted-foreground text-xs">SH</span></span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
