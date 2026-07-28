import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamLogo } from "@/components/team-logo";
import type { TeamData } from "@/lib/dashboard-utils";

export function TeamHeader({ team, side }: { team: TeamData; side: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{side}</Badge>
        </div>
        <CardTitle className="mt-2 flex items-center gap-3 text-xl">
          <TeamLogo team={team.name} size="lg" />
          <span className="min-w-0 truncate">{team.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-2xl font-semibold">
              {team.position != null ? `#${team.position}` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Placering</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">
              {team.points != null ? team.points : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Poäng</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">
              {team.gamesPlayed != null ? team.gamesPlayed : "—"}
            </div>
            <div className="text-xs text-muted-foreground">GP</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
