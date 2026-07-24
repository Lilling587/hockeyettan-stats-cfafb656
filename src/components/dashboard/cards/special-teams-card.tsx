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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Special teams</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-semibold">{fmtPct(team.powerPlayPct)}</div>
          <div className="text-sm text-muted-foreground">
            {team.powerPlayGoals != null ? `${team.powerPlayGoals} mål` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">Powerplay</div>
          {renderEdge(team.powerPlayPct, opponent.powerPlayPct)}
        </div>
        <div>
          <div className="text-2xl font-semibold">{fmtPct(team.penaltyKillPct)}</div>
          <div className="text-sm text-muted-foreground">
            {team.penaltyKillGoalsAgainst != null ? `${team.penaltyKillGoalsAgainst} insläppta` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">Boxplay</div>
          {renderEdge(team.penaltyKillPct, opponent.penaltyKillPct)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
