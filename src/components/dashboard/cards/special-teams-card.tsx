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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{team.name} · Special teams</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Powerplay */}
         <div>
            <div className="text-xs text-muted-foreground">Powerplay</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fmtPct(team.powerPlayPct)}</span>
              {edgeBadge(team.powerPlayPct, opponent.powerPlayPct)}
            </div>
            <div className="text-sm text-muted-foreground">
              {team.powerPlayGoals != null ? `${team.powerPlayGoals} mål` : "—"}
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
              {team.penaltyKillGoalsAgainst != null ? `${team.penaltyKillGoalsAgainst} insläppta` : "—"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
