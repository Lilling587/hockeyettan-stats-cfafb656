import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamData } from "@/lib/dashboard-utils";

export function HottestPlayerCard({ team, label }: { team: TeamData; label: string }) {
  const player = team.hotPlayer;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
       {team.name} · Hetaste spelare{" "}
          <span className="text-xs font-normal text-muted-foreground">({label})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!player ? (
          <div className="text-sm text-muted-foreground">
            Ingen färsk poängdata.
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xl font-semibold">{player.name}</div>
              <Badge variant="default" className="tabular-nums">
                {player.points} p
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {player.goals} M · {player.assists} A på senaste {player.games}{" "}
              match{player.games === 1 ? "en" : "erna"}
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Flest poäng i laget under de senaste {player.games} spelade match
              {player.games === 1 ? "en" : "erna"}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
