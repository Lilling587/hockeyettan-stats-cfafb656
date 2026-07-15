import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { teamPpg, type TeamData } from "@/lib/dashboard-utils";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

function TeamColumn({ team }: { team: TeamData }) {
  const ppg = teamPpg(team);
  return (
    <div className="space-y-1">
      <div className="mb-2 truncate text-sm font-semibold">{team.name}</div>
      <Row label="Placering" value={team.position != null ? `#${team.position}` : "—"} />
      <Row label="Poäng" value={team.points != null ? String(team.points) : "—"} />
      <Row label="Matcher" value={team.gamesPlayed != null ? String(team.gamesPlayed) : "—"} />
      <Row label="Poäng/match" value={ppg != null ? ppg.toFixed(2) : "—"} />
    </div>
  );
}

export function StandingsSnapshotCard({
  home,
  away,
}: {
  home: TeamData;
  away: TeamData;
}) {
  const gap =
    home.points != null && away.points != null
      ? Math.abs(home.points - away.points)
      : null;
  const leader =
    home.points != null && away.points != null && home.points !== away.points
      ? home.points > away.points
        ? home.name
        : away.name
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tabellsnabbkoll</CardTitle>
        <p className="text-xs text-muted-foreground">
          Placering, poäng och form per match för båda lagen.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <TeamColumn team={home} />
          <TeamColumn team={away} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Poängavstånd</span>
          {gap == null ? (
            <Badge variant="outline">—</Badge>
          ) : gap === 0 ? (
            <Badge variant="secondary">Jämnt</Badge>
          ) : (
            <Badge variant="default">
              {leader} +{gap}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
